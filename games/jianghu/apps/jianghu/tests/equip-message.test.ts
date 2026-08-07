/**
 * equip-message.test.ts — E7 装备消息（character.equip / character.unequip，控制面）
 * ===========================================================================
 * 覆盖（无真实 ws / DB；MemoryCharacterStore in-memory fake，复用既有测试模式）：
 *   - equip：背包减 1 + 槽位变化 + 回推 character.inventory（含 equipped/slot）+ 持久化落库；
 *   - unequip：卸下回背包；空槽 → SLOT_EMPTY；非法 slot → BAD_SLOT；
 *   - 重复 equip 换装：原槽装备回背包；
 *   - 世界镜像：resolveEquip 后当前房间 world actor maxHp/attrs 即时生效；
 *   - 游客：resolveEquip → NOT_LOGGED_IN，零持久写（C-Per-1）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CharacterService,
  MemoryCharacterStore,
  createNewCharacter,
} from "../src/persistence.ts";
import {
  setProtocolCharacterService,
  resolveEquip,
  resolveUnequip,
  type ProtocolContext,
  type InventoryMessage,
  type GameErrorReply,
} from "../src/protocol.ts";
import {
  bootResidentRun,
  stopRun,
  getWorld,
  addPlayerToRoom,
  setActiveCharacterService,
} from "../src/run-manager.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { itemProto } from "../sim-core/src/affixes.ts";
import { EntityKind } from "../sim-core/src/types.ts";

/** 预置一个带背包物品的登录角色（itemId → slot 由 itemProto 推导）。 */
async function seedBag(userId: string, items: { itemId: number; rarity: number; affixes: number[] }[]): Promise<CharacterService> {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  const base = createNewCharacter(userId);
  await svc.save(userId, {
    character: base.character,
    inventory: { items: items.map((i) => ({ ...i, slot: itemProto(i.itemId).slot })) },
  });
  return svc;
}

async function assertBagHas(svc: CharacterService, userId: string, itemId: number, present: boolean): Promise<void> {
  const { snapshot } = await svc.loadOrCreate(userId);
  assert.equal(
    snapshot.inventory.items.some((i) => i.itemId === itemId),
    present,
    `bag ${present ? "contains" : "NOT contains"} item ${itemId}`,
  );
}

// ------------------------------------------------------------------
// ① equip：背包移物品 → 槽位 + 回推 inventory + 持久化
// ------------------------------------------------------------------

test("character.equip：背包减 1 + 槽位变化 + 回推 inventory（含 equipped/slot）+ 落库", async () => {
  const userId = "u-eq1";
  const svc = await seedBag(userId, [{ itemId: 3, rarity: 2, affixes: [1] }]); // 3 → weapon
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c1", seatId, roomId: null };
    const reply = (await resolveEquip(ctx, { type: "character.equip", requestId: "eq1", payload: { itemId: 3 } })) as InventoryMessage;

    assert.equal(reply.type, "character.inventory");
    assert.equal(reply.requestId, "eq1");
    assert.equal(reply.items.length, 0, "背包物品已被移出");
    assert.ok(reply.equipped.weapon, "武器槽已装备");
    assert.equal(reply.equipped.weapon!.itemId, 3);
    assert.deepEqual([...reply.equipped.weapon!.affixes], [1]);

    // 持久化：装备已落库。
    const { snapshot } = await svc.loadOrCreate(userId);
    assert.equal(snapshot.character.equipped!.weapon!.itemId, 3, "持久化 equipped.weapon = 3");
    assert.equal(snapshot.inventory.items.length, 0, "持久化背包已清空");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ② unequip：卸下回背包
// ------------------------------------------------------------------

test("character.unequip：卸下回背包；空槽/非法 slot 拒绝", async () => {
  const userId = "u-eq2";
  const svc = await seedBag(userId, [{ itemId: 4, rarity: 2, affixes: [13] }]); // 4 → armor
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c2", seatId, roomId: null };

    // 先装备
    await resolveEquip(ctx, { type: "character.equip", requestId: "e", payload: { itemId: 4 } });

    // 卸下 armor
    const reply = (await resolveUnequip(ctx, { type: "character.unequip", requestId: "u1", payload: { slot: "armor" } })) as InventoryMessage;
    assert.equal(reply.type, "character.inventory");
    assert.ok(reply.items.some((i) => i.itemId === 4), "卸下的物品回背包");
    assert.equal(reply.equipped.armor, undefined, "护甲槽已空");
    await assertBagHas(svc, userId, 4, true);

    // 空槽卸下 → SLOT_EMPTY
    const err2 = (await resolveUnequip(ctx, { type: "character.unequip", requestId: "u2", payload: { slot: "armor" } })) as GameErrorReply;
    assert.equal(err2.type, "game.error");
    assert.equal(err2.error.code, "SLOT_EMPTY");

    // 非法 slot → BAD_SLOT
    const err3 = (await resolveUnequip(ctx, { type: "character.unequip", requestId: "u3", payload: { slot: "helmet" } })) as GameErrorReply;
    assert.equal(err3.error.code, "BAD_SLOT");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ③ 重复 equip 换装：原槽装备回背包
// ------------------------------------------------------------------

test("重复 equip 换装：旧装备回背包，新装备入槽", async () => {
  const userId = "u-eq3";
  const svc = await seedBag(userId, [
    { itemId: 3, rarity: 2, affixes: [1] }, // weapon A
    { itemId: 9, rarity: 3, affixes: [5, 6] }, // weapon B（9 % 3 = 0 → weapon）
  ]);
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c3", seatId, roomId: null };

    await resolveEquip(ctx, { type: "character.equip", requestId: "a", payload: { itemId: 3 } });
    const reply = (await resolveEquip(ctx, { type: "character.equip", requestId: "b", payload: { itemId: 9 } })) as InventoryMessage;

    assert.equal(reply.equipped.weapon!.itemId, 9, "武器槽 = 新装备 B");
    assert.ok(reply.items.some((i) => i.itemId === 3), "旧装备 A 回背包");
    assert.ok(!reply.items.some((i) => i.itemId === 9), "新装备 B 已移出背包");
    await assertBagHas(svc, userId, 3, true);
    await assertBagHas(svc, userId, 9, false);
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ④ 世界镜像：equip → world actor maxHp/attrs 即时生效
// ------------------------------------------------------------------

test("世界镜像：equip 后当前房间 world actor maxHp/attrs 即时生效（setPlayerEquipped）", async () => {
  const userId = "u-eq4";
  const svc = await seedBag(userId, [{ itemId: 4, rarity: 3, affixes: [13] }]); // armor darkgold maxHp 加成 32
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    // 玩家进 RESIDENT 世界（无装备 → maxHp 100）。
    addPlayerToRoom(RESIDENT_ROOM_ID, seatId, userId);
    const world = getWorld(RESIDENT_ROOM_ID)!;
    const actor = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seatId)!;
    assert.equal(actor.maxHp, 100, "无装备 maxHp = 100");

    const ctx: ProtocolContext = { userId, connId: "c4", seatId, roomId: RESIDENT_ROOM_ID };
    const reply = (await resolveEquip(ctx, { type: "character.equip", requestId: "eq4", payload: { itemId: 4 } })) as InventoryMessage;
    assert.equal(reply.type, "character.inventory");

    const actor2 = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seatId)!;
    assert.equal(actor2.maxHp, 132, "世界 actor maxHp 即时 = 100 + armor.baseMaxHp(20) + affixValue(13,darkgold)=12");
    assert.equal(actor2.hp, 132, "hp 同步抬升");
    // attrs 快照回填（攻击/生命/暴击）。
    const snap = world.snapshot();
    const ent = snap.entities.find((e) => e.ownerId === seatId)!;
    assert.equal(ent.attrs!.maxHp, 132, "快照 attrs.maxHp = 世界 maxHp");
    assert.equal(ent.attrs!.atk, 8, "无 atk 词缀 → 面板攻击 = PLAYER_BASE_ATK(8)（E8：普攻基础伤害，面板展示同源）");
    assert.equal(ent.attrs!.crit, 0, "无 crit 词缀 → 暴击 0%");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
  }
});

// ------------------------------------------------------------------
// ⑤ 游客：equip → NOT_LOGGED_IN，零持久写
// ------------------------------------------------------------------

test("游客 character.equip → NOT_LOGGED_IN，零持久写（C-Per-1）", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "guest_eq", guest: true });
    const ctx: ProtocolContext = { userId: "guest_eq", connId: "cg", seatId, roomId: null };
    const reply = (await resolveEquip(ctx, { type: "character.equip", requestId: "g1", payload: { itemId: 3 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "NOT_LOGGED_IN");
    assert.equal(store.saveCount, 0, "游客 equip 不触发 save");
    assert.equal(store.loadCount, 0, "游客 equip 不触发 load（不 loadOrCreate 游客）");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ⑥ 物品不在背包 → ITEM_NOT_FOUND
// ------------------------------------------------------------------

test("character.equip 物品不在背包 → ITEM_NOT_FOUND", async () => {
  const userId = "u-eq6";
  const svc = await seedBag(userId, [{ itemId: 3, rarity: 0, affixes: [] }]);
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c6", seatId, roomId: null };
    const reply = (await resolveEquip(ctx, { type: "character.equip", requestId: "nf", payload: { itemId: 999 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "ITEM_NOT_FOUND");
  } finally {
    // 无 run 循环。
  }
});
