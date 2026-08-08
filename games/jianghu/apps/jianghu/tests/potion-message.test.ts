/**
 * potion-message.test.ts — E21 药水消息（character.usePotion / 击杀给药水，控制面）
 * ===========================================================================
 * 覆盖（无真实 ws / DB；MemoryCharacterStore in-memory fake，复用既有测试模式）：
 *   - 击杀给药水（真实 world + bootResidentRun 接线）：精英击杀 → world onPotionGain →
 *     Character.potions 落库 + 推送 character.inventory（potions 字段，客户端一次拉全）；
 *   - 使用回推：resolveUsePotion 成功 → character.potion {count, cdTicksLeft, healed, tick}
 *     + 落库 Character.potions 递减 + world actor 回血 + 推送 inventory.potions；
 *   - 校验拒绝：无药水（NO_POTIONS）/ 满血（FULL_HP）/ CD 中（POTION_CD）/ 未入房（NOT_IN_ROOM）；
 *   - P0 syncer：使用后同步 session.snapshot（防 autosave/下线覆盖）；
 *   - 游客：resolveUsePotion → NOT_LOGGED_IN，零持久写（C-Per-1）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  bootResidentRun,
  stopRun,
  getWorld,
  addPlayerToRoom,
  setActiveCharacterService,
  setSeatSnapshotSyncer,
  applyPotionGainToCharacter,
} from "../src/run-manager.ts";
import {
  CharacterService,
  MemoryCharacterStore,
  createNewCharacter,
  type CharacterSnapshot,
} from "../src/persistence.ts";
import {
  setProtocolCharacterService,
  setProtocolSnapshotSyncer,
  resolveUsePotion,
  type ProtocolContext,
  type PotionMessage,
  type GameErrorReply,
} from "../src/protocol.ts";
import {
  registerConnection,
  removeConnection,
  type Conn,
} from "../src/connection-registry.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { EntityKind, InputAction } from "../sim-core/src/types.ts";
import { TILE, POTION_CD_TICKS, POTION_HEAL_RATIO } from "../sim-core/src/constants.ts";

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

async function waitUntil(
  cond: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout waiting for: ${what}`);
}

function invMsg(sent: Record<string, unknown>[]) {
  // 击杀同时触发 MaterialGain + PotionGain 两个异步落库/推送；取**最后**一条 character.inventory
  // （最接近最新持久化状态：材料与药水计数均最终一致）。
  const all = sent.filter((m) => (m as { type?: string }).type === "character.inventory");
  return (all[all.length - 1] ?? undefined) as
    | { type: string; items: unknown[]; equipped: unknown; cap: number; materials: number; potions: number }
    | undefined;
}

function potMsg(sent: Record<string, unknown>[]) {
  return sent.find((m) => (m as { type?: string }).type === "character.potion") as
    | { type: string; count: number; cdTicksLeft: number; healed: number; tick: number }
    | undefined;
}

function playerActor(world: NonNullable<ReturnType<typeof getWorld>>, seatId: number) {
  return world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seatId)!;
}

// ------------------------------------------------------------------
// ① 精英击杀 → Character.potions 落库 + 推送 inventory.potions（击杀给药水）
// ------------------------------------------------------------------

test("E21: elite kill → Character.potions 落库 + 推送 inventory.potions=1（开局 2 瓶 → 3）", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId, snapshot } = await svc.begin({ userId: "u-pot-kill", guest: false });
    assert.equal(snapshot!.character.potions, 2, "MVP 开局 2 瓶疗伤药（新手友好）");
    const fc = fakeConn("u-pot-kill");
    registerConnection(fc.conn);
    const world = getWorld(RESIDENT_ROOM_ID)!;
    world.addPlayer(seatId, "u-pot-kill", undefined, undefined, undefined, snapshot?.character.materials, snapshot?.character.potions);

    // 隔离精英到角落 + 压血到 1（测试操控共享 actor 引用，防被动/追击干扰），一击击杀。
    const elite = world.actors().find((a) => a.tier === 1)!;
    elite.x = 3 * TILE;
    elite.y = 3 * TILE;
    elite.aggression = "passive";
    elite.hp = 1;
    const p = world.actors().find((a) => a.ownerId === seatId)!;
    p.x = 3 * TILE + 60; // 技能 slot0 射程 72 内、接触 48 外
    p.y = 3 * TILE;

    world.enqueueInput(seatId, { seq: 1, tick: 0, action: InputAction.SKILL1, dir: 0, skillSlot: 0 });
    world.step();

    await waitUntil(
      async () => (await svc.loadOrCreate("u-pot-kill")).snapshot.character.potions === 3,
      "Character.potions == 3 persisted",
    );
    const snap = await svc.loadOrCreate("u-pot-kill");
    assert.equal(snap.snapshot.character.potions, 3, "精英击杀 → 药水 2 + 1 = 3");
    const push = invMsg(fc.sent);
    assert.ok(push, "击杀后应推送 character.inventory");
    assert.equal(push!.potions, 3, "推送携带 potions=3（客户端一次拉全）");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
    removeConnection("conn_0");
  }
});

// ------------------------------------------------------------------
// ② 使用回推：resolveUsePotion 成功（回血公式 + CD + 消耗 + 落库 + 推送）
// ------------------------------------------------------------------

test("E21: usePotion 成功 → character.potion {count, cdTicksLeft, healed, tick} + 落库 + world 回血", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  bootResidentRun();
  const syncedBox: { snap: CharacterSnapshot | null } = { snap: null };
  setProtocolSnapshotSyncer((_connId, snap) => { syncedBox.snap = snap; });
  try {
    const { seatId, snapshot } = await svc.begin({ userId: "u-pot-use", guest: false });
    addPlayerToRoom(RESIDENT_ROOM_ID, seatId, "u-pot-use", undefined, undefined, snapshot?.character.materials, snapshot?.character.potions);
    const world = getWorld(RESIDENT_ROOM_ID)!;
    const p = playerActor(world, seatId);
    p.hp = 50; // 压血到 50/100 → 回 30 → 80

    const ctx: ProtocolContext = { userId: "u-pot-use", connId: "c1", seatId, roomId: RESIDENT_ROOM_ID };
    const reply = (await resolveUsePotion(ctx, { type: "character.usePotion", requestId: "pot1" })) as PotionMessage;
    assert.equal(reply.type, "character.potion");
    assert.equal(reply.requestId, "pot1");
    assert.equal(reply.count, 1, "药水 2 → 1");
    assert.equal(reply.cdTicksLeft, POTION_CD_TICKS, "使用瞬间 CD 全量 60 tick（5s）");
    assert.equal(reply.healed, Math.round(100 * POTION_HEAL_RATIO), "回血 = round(maxHp×0.3) = 30");
    assert.equal(reply.tick, world.tick, "CD 截止点 = 使用时的 world tick");

    // world actor 权威回血（下一快照自然下发）。
    const p2 = playerActor(world, seatId);
    assert.equal(p2.hp, 80, "50 + 30 = 80");
    assert.equal(p2.potionCount, 1, "world actor 药水计数递减");

    // 持久化 + P0 syncer。
    const snap = await svc.loadOrCreate("u-pot-use");
    assert.equal(snap.snapshot.character.potions, 1, "持久化 Character.potions = 1");
    assert.ok(syncedBox.snap, "P0 syncer 被调用（防 autosave/下线覆盖）");
    assert.equal(syncedBox.snap!.character.potions, 1, "syncer 快照含药水计数");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
    setProtocolSnapshotSyncer(null);
    removeConnection("conn_0");
  }
});

// ------------------------------------------------------------------
// ③ 校验拒绝：满血 / 无药水 / CD / 未入房
// ------------------------------------------------------------------

test("E21: 满血不可用 → FULL_HP（不浪费，主理人拍板）", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId, snapshot } = await svc.begin({ userId: "u-pot-full", guest: false });
    addPlayerToRoom(RESIDENT_ROOM_ID, seatId, "u-pot-full", undefined, undefined, snapshot?.character.materials, snapshot?.character.potions);
    const ctx: ProtocolContext = { userId: "u-pot-full", connId: "c2", seatId, roomId: RESIDENT_ROOM_ID };
    const reply = (await resolveUsePotion(ctx, { type: "character.usePotion", requestId: "f1" })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "FULL_HP");
    // 无副作用：药水未消耗。
    const snap = await svc.loadOrCreate("u-pot-full");
    assert.equal(snap.snapshot.character.potions, 2, "满血失败不消耗药水");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
    removeConnection("conn_0");
  }
});

test("E21: 无药水 → NO_POTIONS；CD 中 → POTION_CD", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId, snapshot } = await svc.begin({ userId: "u-pot-cd", guest: false });
    addPlayerToRoom(RESIDENT_ROOM_ID, seatId, "u-pot-cd", undefined, undefined, snapshot?.character.materials, snapshot?.character.potions);
    const world = getWorld(RESIDENT_ROOM_ID)!;
    const p = playerActor(world, seatId);
    p.hp = 50;
    const ctx: ProtocolContext = { userId: "u-pot-cd", connId: "c3", seatId, roomId: RESIDENT_ROOM_ID };

    // 第一次成功 → CD 进入。
    const r1 = (await resolveUsePotion(ctx, { type: "character.usePotion", requestId: "c3a" })) as PotionMessage;
    assert.equal(r1.type, "character.potion", "第一次使用成功");
    // 立即第二次 → POTION_CD（world tick 未推进，CD 未到）。
    const r2 = (await resolveUsePotion(ctx, { type: "character.usePotion", requestId: "c3b" })) as GameErrorReply;
    assert.equal(r2.type, "game.error");
    assert.equal(r2.error.code, "POTION_CD");

    // 无药水：直接改 world actor 计数为 0 → NO_POTIONS。
    p.potionCount = 0;
    const r3 = (await resolveUsePotion(ctx, { type: "character.usePotion", requestId: "c3c" })) as GameErrorReply;
    assert.equal(r3.type, "game.error");
    assert.equal(r3.error.code, "NO_POTIONS");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
    removeConnection("conn_0");
  }
});

test("E21: 未入房 → NOT_IN_ROOM", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "u-pot-noroom", guest: false });
    const ctx: ProtocolContext = { userId: "u-pot-noroom", connId: "c4", seatId, roomId: null };
    const reply = (await resolveUsePotion(ctx, { type: "character.usePotion", requestId: "n1" })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "NOT_IN_ROOM");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ④ 游客：usePotion → NOT_LOGGED_IN，零持久写
// ------------------------------------------------------------------

test("E21: 游客 character.usePotion → NOT_LOGGED_IN，零持久写（C-Per-1）", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "guest_pot", guest: true });
    const ctx: ProtocolContext = { userId: "guest_pot", connId: "cg", seatId, roomId: RESIDENT_ROOM_ID };
    const reply = (await resolveUsePotion(ctx, { type: "character.usePotion", requestId: "g1" })) as GameErrorReply;
    assert.equal(reply.type, "game.error");
    assert.equal(reply.error.code, "NOT_LOGGED_IN");
    assert.equal(store.saveCount, 0, "游客 usePotion 不触发 save");
    assert.equal(store.loadCount, 0, "游客 usePotion 不触发 load（不 loadOrCreate 游客）");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ⑤ 击杀药水落库（直接驱动 applyPotionGainToCharacter，模拟 world 事件增量）
// ------------------------------------------------------------------

test("E21: 击杀药水事件（potions=2，BOSS）→ Character.potions +2 + 推送 potions=2", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "u-pot-boss", guest: false });
    const fc = fakeConn("u-pot-boss");
    registerConnection(fc.conn);

    await applyPotionGainToCharacter(svc, "u-pot-boss", seatId, 2);
    const snap = await svc.loadOrCreate("u-pot-boss");
    assert.equal(snap.snapshot.character.potions, 4, "开局 2 + BOSS 击杀 2 = 4");
    const push = invMsg(fc.sent);
    assert.ok(push, "击杀后应推送 character.inventory");
    assert.equal(push!.potions, 4, "推送携带 potions=4");
  } finally {
    removeConnection("conn_0");
  }
});
