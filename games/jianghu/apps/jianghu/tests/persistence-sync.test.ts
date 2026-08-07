// P0 回归测试：equip/unequip/拾取/升级落库后必须同步 session.snapshot，
// 否则 autosave/下线 save 会用旧快照覆盖文件 → 装备/拾取/升级丢失。
// 根因（2026-08-07 用户反馈「穿上的装备丢失」）：resolveEquip 只 cs.save 新快照，
// 但 gateway 的 30s autosave / 下线 save 用 session.snapshot（旧、不含 equipped）覆盖文件。
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryCharacterStore, CharacterService } from "../src/persistence.ts";
import { resolveEquip, resolveUnequip, setProtocolCharacterService, setProtocolSnapshotSyncer } from "../src/protocol.ts";
import { itemProto } from "../sim-core/src/affixes.ts";
import type { CharacterSnapshot } from "../src/persistence.ts";

function makeEnv(uid = "u1") {
  const store = new MemoryCharacterStore();
  const cs = new CharacterService({ store });
  const synced: { connId: string; snap: CharacterSnapshot }[] = [];
  setProtocolCharacterService(cs);
  setProtocolSnapshotSyncer((connId, snap) => synced.push({ connId, snap }));
  return { store, cs, synced };
}

/** 造一个背包里带一件武器物品的角色（uid 已 begin 登记 seatId=1）。 */
async function seedCharacterWithItem(cs: CharacterService, uid: string, itemId: number) {
  await cs.begin({ userId: uid, guest: false });
  const { snapshot } = await cs.loadOrCreate(uid);
  const slot = itemProto(itemId).slot;
  const item = { itemId, rarity: 1, affixes: [1], slot };
  await cs.save(uid, {
    character: snapshot.character,
    inventory: { items: [...snapshot.inventory.items, item] },
  });
  return { item, slot };
}

function ctxFor(connId: string, seatId: number) {
  return { connId, seatId, roomId: "room_resident_public" };
}

test("P0: resolveEquip 落库后 session.snapshot 同步（含 equipped）", async () => {
  const { cs, synced } = makeEnv();
  const uid = "u1";
  // 找一个武器原型的 itemId（affixes 表 itemId 段 → slot；取原型表第一个 weapon）
  const { item, slot } = await seedCharacterWithItem(cs, uid, 3);
  assert.equal(slot, "weapon");

  const reply = await resolveEquip(ctxFor("c1", 1) as never, {
    type: "character.equip",
    requestId: "eq1",
    payload: { itemId: item.itemId },
  } as never);

  assert.ok(reply, "equip should return a reply");
  // syncer 必须被调用，且快照带 equipped[weapon]
  assert.equal(synced.length, 1, "session.snapshot syncer must be invoked exactly once");
  const { snap } = synced[0];
  assert.equal(synced[0].connId, "c1");
  assert.ok(snap.character.equipped?.weapon, "equipped.weapon must be present in synced snapshot");
  assert.equal(snap.character.equipped!.weapon!.itemId, item.itemId);
  assert.equal(snap.inventory.items.length, 0, "weapon moved out of inventory");
});

test("P0: resolveUnequip 落库后 session.snapshot 同步（槽位清空回背包）", async () => {
  const { cs, synced } = makeEnv();
  const { item } = await seedCharacterWithItem(cs, "u1", 3);
  await resolveEquip(ctxFor("c1", 1) as never, { type: "character.equip", requestId: "eq1", payload: { itemId: item.itemId } } as never);

  const reply = await resolveUnequip(ctxFor("c1", 1) as never, { type: "character.unequip", requestId: "uq1", payload: { slot: "weapon" } } as never);
  assert.ok(reply);
  const last = synced[synced.length - 1];
  assert.equal(last.snap.character.equipped?.weapon, undefined, "weapon unequipped");
  assert.equal(last.snap.inventory.items.length, 1, "weapon back in inventory");
});

test("P0: 游客 equip 拒绝且不触发 syncer（C-Per-1）", async () => {
  const { cs, synced } = makeEnv();
  // 游客 begin：guest=true
  await cs.begin({ userId: "guest1", guest: true });
  const reply = await resolveEquip(ctxFor("c2", 2) as never, { type: "character.equip", requestId: "eq1", payload: { itemId: 3 } } as never);
  assert.ok(reply && (reply as { error?: unknown }).error, "guest equip must error");
  assert.equal(synced.length, 0, "no snapshot sync for guest");
});
