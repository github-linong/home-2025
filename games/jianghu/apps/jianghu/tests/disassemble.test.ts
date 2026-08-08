/**
 * disassemble.test.ts — E22 装备分解消息（character.disassemble，控制面）
 * ===========================================================================
 * 覆盖（无真实 ws / DB；MemoryCharacterStore in-memory fake，复用既有测试模式）：
 *   - 分解成功：背包物品移除、强化石按稀有度（0白/1蓝/2金/3暗金 → 0/1/2/3 石）、药水 +1、
 *     材料/药水落库 + P0 syncer（seatSnapshotSyncer）+ 回推 character.inventory（items/materials/potions）；
 *   - 产出表：DISASSEMBLE_STONES_BY_RARITY（0..3 → 0..3 石）+ DISASSEMBLE_POTIONS=1（白装保底 1 瓶）；
 *   - 已装备物品拒（EQUIPPED_ITEM，已装备先卸下）；
 *   - 材料物品拒（NOT_DISASSEMBLABLE，强化石 900000 不入包防御）；
 *   - 背包无此物品拒（ITEM_NOT_FOUND）；
 *   - 游客拒（NOT_LOGGED_IN，C-Per-1 零持久写）；
 *   - 串行队列：与击杀材料落库并发（enqueueSeatSave 同队列）→ 无丢失更新（材料/药水最终一致）；
 *   - world actor 同步：入房分解 → actor.materials/potionCount 即时更新；未入房 → 缓存等 addPlayer 播种。
 * 纯背包控制面操作（不涉掉落 Rng 流 / 世界实体）→ playtest golden 不变（D9，由 playtest 实测）。
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
  resolveDisassemble,
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
  setSeatSnapshotSyncer,
  enqueueSeatSave,
  applyMaterialGainToCharacter,
} from "../src/run-manager.ts";
import {
  registerConnection,
  removeConnection,
  type Conn,
} from "../src/connection-registry.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { itemProto, type EquippedSlots } from "../sim-core/src/affixes.ts";
import { EntityKind } from "../sim-core/src/types.ts";
import {
  ENCHANT_STONE_ITEM_ID,
  DISASSEMBLE_STONES_BY_RARITY,
  DISASSEMBLE_POTIONS,
} from "../sim-core/src/constants.ts";

/** 预置登录角色（items + equipped + materials + potions）。 */
async function seedCharacter(
  userId: string,
  opts: {
    items?: { itemId: number; rarity: number; affixes: number[]; enchantLevel?: number }[];
    equipped?: EquippedSlots;
    materials?: number;
    potions?: number;
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
      potions: opts.potions ?? base.character.potions ?? 2,
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

/** fake Conn：记录控制面 JSON（复用既有测试模式）。 */
function fakeConn(userId: string): { conn: Conn; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const conn: Conn = {
    connId: "",
    userId,
    roomId: null,
    send(payload: string | Uint8Array, opts?: { binary?: boolean }) {
      if (opts?.binary) return; // 数据面二进制不参与本测试
      sent.push(JSON.parse(payload as string) as Record<string, unknown>);
    },
  };
  return { conn, sent };
}

function invMsg(sent: Record<string, unknown>[]) {
  const all = sent.filter((m) => (m as { type?: string }).type === "character.inventory");
  return (all[all.length - 1] ?? undefined) as
    | { type: string; items: unknown[]; equipped: unknown; cap: number; materials: number; potions: number }
    | undefined;
}

// ------------------------------------------------------------------
// ① 分解成功：背包减、石数按稀有度、药水 +1、材料/药水落库 + syncer + 推送
// ------------------------------------------------------------------

test("character.disassemble：暗金 → 3 石 + 药水 1，背包移除、材料/药水落库 + syncer + 推送", async () => {
  const userId = "u-dis1";
  const svc = await seedCharacter(userId, {
    items: [{ itemId: 3, rarity: 3, affixes: [12] }], // itemId=3 → weapon；暗金
    materials: 5,
    potions: 4,
  });
  setProtocolCharacterService(svc);
  setActiveCharacterService(svc);
  const syncedBox: { snap: CharacterSnapshot | null } = { snap: null };
  setSeatSnapshotSyncer((_seatId, snap) => { syncedBox.snap = snap; });
  const fc = fakeConn(userId);
  registerConnection(fc.conn);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c1", seatId, roomId: null };
    const reply = (await resolveDisassemble(ctx, { type: "character.disassemble", requestId: "dis1", payload: { itemId: 3 } })) as InventoryMessage;

    assert.equal(reply.type, "character.inventory");
    assert.equal(reply.requestId, "dis1");
    assert.ok(!reply.items.some((i) => i.itemId === 3), "背包物品已移除");
    assert.equal(reply.materials, 8, "材料 5 + 3（暗金）= 8");
    assert.equal(reply.potions, 5, "药水 4 + 1 = 5");

    // 持久化：物品移除 + 材料/药水落库。
    const { snapshot } = await svc.loadOrCreate(userId);
    assert.ok(!snapshot.inventory.items.some((i) => i.itemId === 3), "持久化背包无该物品");
    assert.equal(snapshot.character.materials, 8, "持久化 Character.materials = 8");
    assert.equal(snapshot.character.potions, 5, "持久化 Character.potions = 5");

    // P0 syncer：同步 session.snapshot（防 autosave/下线覆盖）。
    assert.ok(syncedBox.snap, "P0 syncer 被调用（防 autosave/下线覆盖）");
    assert.equal(syncedBox.snap!.character.materials, 8, "syncer 快照含材料");
    assert.equal(syncedBox.snap!.character.potions, 5, "syncer 快照含药水");

    // 控制面推送 character.inventory（items/materials/potions 一次拉全）。
    const push = invMsg(fc.sent);
    assert.ok(push, "分解后应推送 character.inventory");
    assert.equal(push!.materials, 8, "推送携带 materials=8");
    assert.equal(push!.potions, 5, "推送携带 potions=5");
  } finally {
    setSeatSnapshotSyncer(null);
    removeConnection(fc.conn.connId);
  }
});

// ------------------------------------------------------------------
// ② 产出表：稀有度 0..3 → 0..3 石 + 固定 1 药水（白装保底）
// ------------------------------------------------------------------

test("分解产出表：白0/蓝1/金2/暗金3 石 + 药水 1（白装保底有用）", async () => {
  const userId = "u-dis2";
  // 4 件不同 itemId，各稀有度一件；起始 0 材料 0 药水。
  const items = [
    { itemId: 101, rarity: 0, affixes: [] },
    { itemId: 102, rarity: 1, affixes: [1] },
    { itemId: 103, rarity: 2, affixes: [1, 2] },
    { itemId: 104, rarity: 3, affixes: [1, 2, 3, 4, 5] },
  ];
  const svc = await seedCharacter(userId, { items, materials: 0, potions: 0 });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c2", seatId, roomId: null };
    const seen: Record<number, { stones: number; potions: number }> = {};
    let prevM = 0;
    let prevP = 0;
    for (const it of items) {
      const reply = (await resolveDisassemble(ctx, { type: "character.disassemble", requestId: "d" + it.itemId, payload: { itemId: it.itemId } })) as InventoryMessage;
      assert.equal(reply.type, "character.inventory", `rarity ${it.rarity} 分解成功`);
      // 每次分解的**增量**（材料/药水为累计值，差分即本次产出）。
      seen[it.rarity] = { stones: reply.materials - prevM, potions: reply.potions - prevP };
      prevM = reply.materials;
      prevP = reply.potions;
    }
    for (const r of [0, 1, 2, 3]) {
      const expected = DISASSEMBLE_STONES_BY_RARITY[r];
      assert.equal(seen[r].stones, expected, `rarity ${r} → ${expected} 石`);
      // 固定 1 药水/件（白装也给保底 1 瓶）。
      assert.equal(seen[r].potions, DISASSEMBLE_POTIONS, `rarity ${r} → 药水 ${DISASSEMBLE_POTIONS} 瓶`);
    }
    // 白装（0 石）也给 1 瓶保底药水；4 件累计药水 = 4（C7 常量镜像）。
    assert.equal(seen[0].stones, 0, "白装 0 石");
    assert.equal(prevP, 4 * DISASSEMBLE_POTIONS, "4 件分解累计药水 = 4（白装也给保底 1 瓶）");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ③ 已装备拒（EQUIPPED_ITEM，已装备先卸下）
// ------------------------------------------------------------------

test("已装备物品分解 → EQUIPPED_ITEM（已装备先卸下）", async () => {
  const userId = "u-dis3";
  const svc = await seedCharacter(userId, {
    equipped: { weapon: { itemId: 3, rarity: 3, affixes: [12] } }, // 已穿武器（不在背包）
  });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c3", seatId, roomId: null };
    const reply = (await resolveDisassemble(ctx, { type: "character.disassemble", requestId: "d3", payload: { itemId: 3 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "EQUIPPED_ITEM");
    // 无副作用。
    const { snapshot } = await svc.loadOrCreate(userId);
    assert.equal(snapshot.character.materials, 0, "失败不改材料");
    assert.ok(snapshot.character.equipped?.weapon, "已装备槽未变");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ④ 材料物品拒（NOT_DISASSEMBLABLE，强化石 900000）
// ------------------------------------------------------------------

test("材料物品分解（ENCHANT_STONE_ITEM_ID）→ NOT_DISASSEMBLABLE", async () => {
  const userId = "u-dis4";
  const svc = await seedCharacter(userId, { materials: 3 });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c4", seatId, roomId: null };
    const reply = (await resolveDisassemble(ctx, { type: "character.disassemble", requestId: "d4", payload: { itemId: ENCHANT_STONE_ITEM_ID } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "NOT_DISASSEMBLABLE");
    const { snapshot } = await svc.loadOrCreate(userId);
    assert.equal(snapshot.character.materials, 3, "失败不改材料");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ⑤ 背包无此物品拒（ITEM_NOT_FOUND）
// ------------------------------------------------------------------

test("背包无此物品 → ITEM_NOT_FOUND", async () => {
  const userId = "u-dis5";
  const svc = await seedCharacter(userId, { items: [{ itemId: 3, rarity: 2, affixes: [1] }] });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c5", seatId, roomId: null };
    const reply = (await resolveDisassemble(ctx, { type: "character.disassemble", requestId: "d5", payload: { itemId: 999 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "ITEM_NOT_FOUND");
    const { snapshot } = await svc.loadOrCreate(userId);
    assert.equal(snapshot.inventory.items.length, 1, "失败不改背包");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ⑥ 游客拒（NOT_LOGGED_IN，C-Per-1 零持久写）
// ------------------------------------------------------------------

test("游客 character.disassemble → NOT_LOGGED_IN，零持久写（C-Per-1）", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "guest_dis", guest: true });
    const ctx: ProtocolContext = { userId: "guest_dis", connId: "cg", seatId, roomId: null };
    const reply = (await resolveDisassemble(ctx, { type: "character.disassemble", requestId: "g1", payload: { itemId: 3 } })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "NOT_LOGGED_IN");
    assert.equal(store.saveCount, 0, "游客分解不触发 save");
    assert.equal(store.loadCount, 0, "游客分解不触发 load（不 loadOrCreate 游客）");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ⑦ 串行队列：与击杀材料落库并发 → 无丢失更新
// ------------------------------------------------------------------

test("分解与击杀材料落库串行（enqueueSeatSave 同队列，无丢失更新）", async () => {
  const userId = "u-dis7";
  // 暗金 item（3 石）；起始 materials=1、potions=2。
  const svc = await seedCharacter(userId, {
    items: [{ itemId: 3, rarity: 3, affixes: [12] }],
    materials: 1,
    potions: 2,
  });
  setProtocolCharacterService(svc);
  setActiveCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c7", seatId, roomId: null };
    // 击杀材料事件（+2 石）与分解（+3 石 +1 药水 + 移除物品）同时入队 → 串行执行。
    await Promise.all([
      enqueueSeatSave(seatId, () => applyMaterialGainToCharacter(svc, userId, seatId, 2)),
      resolveDisassemble(ctx, { type: "character.disassemble", requestId: "d7", payload: { itemId: 3 } }),
    ]);
    const { snapshot } = await svc.loadOrCreate(userId);
    assert.equal(snapshot.character.materials, 6, "材料 = 1 + 2(击杀) + 3(分解暗金) = 6（无丢失更新）");
    assert.equal(snapshot.character.potions, 3, "药水 = 2 + 1(分解) = 3");
    assert.ok(!snapshot.inventory.items.some((i) => i.itemId === 3), "物品已从背包移除");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ⑧ world actor 同步：入房分解 → actor 计数即时更新；未入房 → 缓存等 addPlayer 播种
// ------------------------------------------------------------------

test("入房分解 → world actor materials/potionCount 即时更新（setPlayerCounters）", async () => {
  const userId = "u-dis8";
  const svc = await seedCharacter(userId, {
    items: [{ itemId: 3, rarity: 3, affixes: [12] }], // 暗金 → 3 石
    materials: 5,
    potions: 4,
  });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    addPlayerToRoom(RESIDENT_ROOM_ID, seatId, userId, undefined, undefined, 5, 4);
    const world = getWorld(RESIDENT_ROOM_ID)!;
    const actor0 = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seatId)!;
    assert.equal(actor0.materials, 5, "入房播种材料 = 5");
    assert.equal(actor0.potionCount, 4, "入房播种药水 = 4");

    const ctx: ProtocolContext = { userId, connId: "c8", seatId, roomId: RESIDENT_ROOM_ID };
    const reply = (await resolveDisassemble(ctx, { type: "character.disassemble", requestId: "d8", payload: { itemId: 3 } })) as InventoryMessage;
    assert.equal(reply.type, "character.inventory");
    assert.equal(reply.materials, 8, "材料 5 + 3 = 8");
    assert.equal(reply.potions, 5, "药水 4 + 1 = 5");

    const actor1 = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seatId)!;
    assert.equal(actor1.materials, 8, "world actor materials 即时 = 8");
    assert.equal(actor1.potionCount, 5, "world actor potionCount 即时 = 5");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
  }
});

test("未入房分解 → 缓存更新，随后 addPlayer 播种世界镜像计数", async () => {
  const userId = "u-dis8b";
  const svc = await seedCharacter(userId, {
    items: [{ itemId: 3, rarity: 2, affixes: [12] }], // 金 → 2 石
    materials: 0,
    potions: 0,
  });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId, guest: false });
    const ctx: ProtocolContext = { userId, connId: "c8b", seatId, roomId: null }; // 未入房
    const reply = (await resolveDisassemble(ctx, { type: "character.disassemble", requestId: "d8b", payload: { itemId: 3 } })) as InventoryMessage;
    assert.equal(reply.materials, 2, "材料 0 + 2（金）= 2");
    assert.equal(reply.potions, 1, "药水 0 + 1 = 1");

    // 未入房时无 actor；随后 addPlayerToRoom 不显式传材料/药水 → 从缓存播种（等 addPlayer 播种）。
    addPlayerToRoom(RESIDENT_ROOM_ID, seatId, userId, undefined, undefined);
    const world = getWorld(RESIDENT_ROOM_ID)!;
    const actor = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seatId)!;
    assert.equal(actor.materials, 2, "addPlayer 播种材料 = 2（来自分解后缓存）");
    assert.equal(actor.potionCount, 1, "addPlayer 播种药水 = 1（来自分解后缓存）");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
  }
});
