/**
 * enchant.test.ts — E19 强化消息（character.enchant，控制面）
 * ===========================================================================
 * 覆盖（无真实 ws / DB；MemoryCharacterStore in-memory fake，复用既有测试模式）：
 *   - 强化成功：背包物品 +1、材料消耗 1、回推 character.inventory（含 enchantLevel/materials）；
 *   - 词缀强度公式：+1 后 computeEquipStats 放大（属性计算时应用，不存词缀表）；
 *   - 上限 MAX_ENCHANT_LEVEL(+5) 拒（ENCHANT_MAX_LEVEL）；
 *   - 材料不足拒（NO_MATERIALS）；
 *   - 非背包/非已装备物品拒（ITEM_NOT_FOUND）；强化石不可强化（ENCHANT_MATERIAL）；
 *   - 已装备物品强化 → setPlayerEquipped 同步 world actor 属性（maxHp/attrs 即时生效）；
 *   - 持久化：save 含 enchantLevel + materials（递减）；P0 syncer 同步 session.snapshot；
 *   - 游客：resolveEnchant → NOT_LOGGED_IN，零持久写（C-Per-1）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CharacterService,
  MemoryCharacterStore,
  createNewCharacter,
  type CharacterSnapshot,
} from "../src/persistence.ts";
import {
  setProtocolCharacterService,
  setProtocolSnapshotSyncer,
  resolveEnchant,
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
import {
  itemProto,
  computeEquipStats,
  type EquippedSlots,
} from "../sim-core/src/affixes.ts";
import { EntityKind } from "../sim-core/src/types.ts";
import { ENCHANT_STONE_ITEM_ID, MAX_ENCHANT_LEVEL } from "../sim-core/src/constants.ts";

/** 预置登录角色（items + equipped + materials）。 */
async function seedCharacter(
  userId: string,
  opts: {
    items?: { itemId: number; rarity: number; affixes: number[]; enchantLevel?: number }[];
    equipped?: EquippedSlots;
    materials?: number;
  } = {},
): Promise<CharacterService> {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  const base = createNewCharacter(userId);
  const snap: CharacterSnapshot = {
    character: {
      ...base.character,
      equipped: opts.equipped ?? {},
      materials: opts.materials ?? 0,
    },
    inventory: {
      items: (opts.items ?? []).map((i) => ({
        ...i,
        slot: itemProto(i.itemId).slot,
        ...(i.enchantLevel ? { enchantLevel: i.enchantLevel } : {}),
      })),
    },
  };
  await svc.save(userId, snap);
  return svc;
}

async function bagItem(svc: CharacterService, userId: string, itemId: number) {
  const { snapshot } = await svc.loadOrCreate(userId);
  return snapshot.inventory.items.find((i) => i.itemId === itemId);
}

// ------------------------------------------------------------------
// ① 强化成功：+1、材料消耗、回推 inventory（enchantLevel + materials）
// ------------------------------------------------------------------

test("character.enchant：背包物品 +1 + 材料消耗 1 + 回推 inventory（enchantLevel/materials）", async () => {
  const userId = "u-en1";
  // itemId=3 → weapon（baseAtk 5）；affix 12（atk 24）darkgold → 58。
  const svc = await seedCharacter(userId, {
    items: [{ itemId: 3, rarity: 3, affixes: [12] }],
    materials: 3,
  });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c1", seatId, roomId: null };
    const reply = (await resolveEnchant(ctx, { type: "character.enchant", requestId: "en1", payload: { itemId: 3 } })) as InventoryMessage;

    assert.equal(reply.type, "character.inventory");
    assert.equal(reply.requestId, "en1");
    const it = reply.items.find((i) => i.itemId === 3)!;
    assert.equal(it.enchantLevel, 1, "背包物品强化 +1");
    assert.equal(reply.materials, 2, "材料 3 → 2（消耗 1 石）");

    // 持久化：enchantLevel 落库 + materials 递减。
    const saved = await bagItem(svc, userId, 3);
    assert.equal(saved!.enchantLevel, 1, "持久化 item.enchantLevel = 1");
    const { snapshot } = await svc.loadOrCreate(userId);
    assert.equal(snapshot.character.materials, 2, "持久化 Character.materials = 2");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ② 词缀强度公式：强化后 computeEquipStats 放大（属性计算时应用）
// ------------------------------------------------------------------

test("词缀强度公式：+1 后 computeEquipStats 放大（词缀 value ×(1+0.15×level)，proto 不放大）", async () => {
  // itemId=3 weapon baseAtk 5；affix 12 darkgold → affixValue 58；未强化 atk=63，+1 → round(58×1.15)=67 → 72。
  const w0: EquippedSlots = { weapon: { itemId: 3, rarity: 3, affixes: [12] } };
  const w1: EquippedSlots = { weapon: { itemId: 3, rarity: 3, affixes: [12], enchantLevel: 1 } };
  assert.equal(computeEquipStats(w0).atk, 63, "未强化 atk = 5 + 58 = 63");
  assert.equal(computeEquipStats(w1).atk, 72, "+1 atk = 5 + round(58×1.15)=67 → 72（公式在属性计算时应用）");
});

// ------------------------------------------------------------------
// ③ 上限 +5 拒
// ------------------------------------------------------------------

test("已满 +5 → ENCHANT_MAX_LEVEL", async () => {
  const userId = "u-en3";
  const svc = await seedCharacter(userId, {
    items: [{ itemId: 3, rarity: 2, affixes: [1], enchantLevel: MAX_ENCHANT_LEVEL }],
    materials: 10,
  });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c3", seatId, roomId: null };
    const reply = (await resolveEnchant(ctx, { type: "character.enchant", requestId: "e3", payload: { itemId: 3 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "ENCHANT_MAX_LEVEL");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ④ 材料不足拒
// ------------------------------------------------------------------

test("材料不足（materials < ENCHANT_COST）→ NO_MATERIALS", async () => {
  const userId = "u-en4";
  const svc = await seedCharacter(userId, {
    items: [{ itemId: 3, rarity: 2, affixes: [1] }],
    materials: 0,
  });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c4", seatId, roomId: null };
    const reply = (await resolveEnchant(ctx, { type: "character.enchant", requestId: "e4", payload: { itemId: 3 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "NO_MATERIALS");
    // 无副作用：背包/材料未变。
    const saved = await bagItem(svc, userId, 3);
    assert.equal(saved!.enchantLevel, undefined, "失败不改变 enchantLevel");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ⑤ 非背包/非已装备物品拒 + 强化石不可强化
// ------------------------------------------------------------------

test("物品不在背包/已装备 → ITEM_NOT_FOUND", async () => {
  const userId = "u-en5";
  const svc = await seedCharacter(userId, { items: [{ itemId: 3, rarity: 0, affixes: [] }], materials: 5 });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c5", seatId, roomId: null };
    const reply = (await resolveEnchant(ctx, { type: "character.enchant", requestId: "e5", payload: { itemId: 999 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "ITEM_NOT_FOUND");
  } finally {
    // 无 run 循环。
  }
});

test("强化石不可强化（ENCHANT_STONE_ITEM_ID）→ ENCHANT_MATERIAL", async () => {
  const userId = "u-en5b";
  const svc = await seedCharacter(userId, { materials: 5 });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c5b", seatId, roomId: null };
    const reply = (await resolveEnchant(ctx, { type: "character.enchant", requestId: "e5b", payload: { itemId: ENCHANT_STONE_ITEM_ID } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "ENCHANT_MATERIAL");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ⑥ 已装备物品强化 → setPlayerEquipped 同步 world actor 属性
// ------------------------------------------------------------------

test("已装备物品强化 → world actor attrs 即时生效（setPlayerEquipped 重算）", async () => {
  const userId = "u-en6";
  // equipped weapon（itemId=3，darkgold affix 12 → atk 58）；未入背包。
  const svc = await seedCharacter(userId, {
    equipped: { weapon: { itemId: 3, rarity: 3, affixes: [12] } },
    materials: 2,
  });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    addPlayerToRoom(RESIDENT_ROOM_ID, seatId, userId, { weapon: { itemId: 3, rarity: 3, affixes: [12] } });
    const world = getWorld(RESIDENT_ROOM_ID)!;
    const actor0 = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seatId)!;
    // 未强化：equipStats.atk = 5 + 58 = 63 → attrs.atk = PLAYER_BASE_ATK(8) + 63 = 71。
    const snap0 = world.snapshot();
    const ent0 = snap0.entities.find((e) => e.ownerId === seatId)!;
    assert.equal(ent0.attrs!.atk, 71, "未强化 attrs.atk = 8 + 63 = 71");

    const ctx: ProtocolContext = { userId, connId: "c6", seatId, roomId: RESIDENT_ROOM_ID };
    const reply = (await resolveEnchant(ctx, { type: "character.enchant", requestId: "en6", payload: { itemId: 3 } })) as InventoryMessage;
    assert.equal(reply.type, "character.inventory");
    assert.equal(reply.materials, 1, "材料 2 → 1");
    assert.equal(reply.equipped.weapon!.enchantLevel, 1, "已装备武器强化 +1");

    const actor1 = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seatId)!;
    assert.equal(actor1.equipStats!.atk, 72, "world actor equipStats.atk = 5 + round(58×1.15)=67 → 72");
    const snap1 = world.snapshot();
    const ent1 = snap1.entities.find((e) => e.ownerId === seatId)!;
    assert.equal(ent1.attrs!.atk, 80, "attrs.atk 即时 = 8 + 72 = 80");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
  }
});

// ------------------------------------------------------------------
// ⑦ 持久化 + P0 syncer 同步 session.snapshot
// ------------------------------------------------------------------

test("强化后 save 含 enchantLevel + materials；P0 syncer 同步 session.snapshot", async () => {
  const userId = "u-en7";
  const svc = await seedCharacter(userId, {
    items: [{ itemId: 4, rarity: 3, affixes: [22] }], // armor darkgold maxHp 120
    materials: 1,
  });
  setProtocolCharacterService(svc);
  const syncedBox: { snap: CharacterSnapshot | null } = { snap: null };
  setProtocolSnapshotSyncer((_connId, snap) => { syncedBox.snap = snap; });
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c7", seatId, roomId: null };
    await resolveEnchant(ctx, { type: "character.enchant", requestId: "en7", payload: { itemId: 4 } });

    assert.ok(syncedBox.snap, "P0 syncer 被调用（防 autosave/下线覆盖）");
    const synced = syncedBox.snap!;
    const it = synced.inventory.items.find((i) => i.itemId === 4)!;
    assert.equal(it.enchantLevel, 1, "syncer 快照含 enchantLevel");
    assert.equal(synced.character.materials, 0, "syncer 快照含 materials（消耗后）");
    const saved = await bagItem(svc, userId, 4);
    assert.equal(saved!.enchantLevel, 1, "持久化 enchantLevel 落库");
  } finally {
    setProtocolSnapshotSyncer(null);
  }
});

// ------------------------------------------------------------------
// ⑧ 游客：enchant → NOT_LOGGED_IN，零持久写
// ------------------------------------------------------------------

test("游客 character.enchant → NOT_LOGGED_IN，零持久写（C-Per-1）", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "guest_en", guest: true });
    const ctx: ProtocolContext = { userId: "guest_en", connId: "cg", seatId, roomId: null };
    const reply = (await resolveEnchant(ctx, { type: "character.enchant", requestId: "g1", payload: { itemId: 3 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "NOT_LOGGED_IN");
    assert.equal(store.saveCount, 0, "游客 enchant 不触发 save");
    assert.equal(store.loadCount, 0, "游客 enchant 不触发 load（不 loadOrCreate 游客）");
  } finally {
    // 无 run 循环。
  }
});
