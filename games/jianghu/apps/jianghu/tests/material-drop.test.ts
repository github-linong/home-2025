/**
 * material-drop.test.ts — E19 强化石掉落（精英/BOSS 击杀 → 材料计数 + 推送）
 * ===========================================================================
 * 覆盖（无真实 ws / DB；MemoryCharacterStore in-memory fake，复用既有测试模式）：
 *   - 精英击杀（bootResidentRun 接线）→ world onMaterialGain → Character.materials 落库
 *     + 推送 character.inventory（materials 字段，客户端一次拉全）；
 *   - BOSS 击杀 → +2（直接驱动 applyMaterialGainToCharacter，模拟 world 事件 stones=2）；
 *   - 游客击杀 → 零持久写 + 不推送（C-Per-1）；
 *   - 材料计数独立于掉落 Rng 流（sim-core unit 已证 actor.materials + 事件；本文件聚焦编排层接线）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  bootResidentRun,
  stopRun,
  getWorld,
  setActiveCharacterService,
  applyMaterialGainToCharacter,
} from "../src/run-manager.ts";
import {
  CharacterService,
  MemoryCharacterStore,
} from "../src/persistence.ts";
import {
  registerConnection,
  removeConnection,
  type Conn,
} from "../src/connection-registry.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { EntityKind, InputAction } from "../sim-core/src/types.ts";
import { TILE } from "../sim-core/src/constants.ts";

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
  return sent.find((m) => (m as { type?: string }).type === "character.inventory") as
    | { type: string; items: unknown[]; equipped: unknown; cap: number; materials: number }
    | undefined;
}

// ------------------------------------------------------------------
// ① 精英击杀（真实 world + bootResidentRun 接线）→ 落库 + 推送
// ------------------------------------------------------------------

test("E19: elite kill → Character.materials 落库 + 推送 inventory.materials=1", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId: "u-mat", guest: false });
    const fc = fakeConn("u-mat");
    registerConnection(fc.conn);
    const world = getWorld(RESIDENT_ROOM_ID)!;
    world.addPlayer(seatId, "u-mat");

    // 隔离精英到角落 + 压血到 1（测试操控共享 actor 引用，防被动/追击干扰），一击击杀。
    const elite = world.actors().find((a) => a.tier === 1)!;
    elite.x = 3 * TILE;
    elite.y = 3 * TILE;
    elite.aggression = "passive";
    elite.hp = 1;
    const p = world.actors().find((a) => a.ownerId === seatId)!;
    p.x = 3 * TILE + 60; // 技能 slot0 射程 72 内、接触 48 外
    p.y = 3 * TILE;

    // 手动驱动一次 SKILL1（同步触发 world.onMaterialGain → handleMaterialGain → async 落库）。
    world.enqueueInput(seatId, { seq: 1, tick: 0, action: InputAction.SKILL1, dir: 0, skillSlot: 0 });
    world.step();

    await waitUntil(
      async () => (await svc.loadOrCreate("u-mat")).snapshot.character.materials === 1,
      "Character.materials == 1 persisted",
    );
    const snap = await svc.loadOrCreate("u-mat");
    assert.equal(snap.snapshot.character.materials, 1, "精英击杀 → Character.materials 落库 = 1");

    const push = invMsg(fc.sent);
    assert.ok(push, "击杀后应推送 character.inventory");
    assert.equal(push!.materials, 1, "推送携带 materials=1（客户端一次拉全）");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
    removeConnection("conn_0"); // 防御清理（fake conn 无真实注册 id 则忽略）
  }
});

// ------------------------------------------------------------------
// ② BOSS 击杀 → +2（直接驱动 applyMaterialGainToCharacter，模拟 world 事件 stones=2）
// ------------------------------------------------------------------

test("E19: boss kill event (stones=2) → Character.materials +2 + 推送 materials=2", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "u-bossmat", guest: false });
    const fc = fakeConn("u-bossmat");
    registerConnection(fc.conn);

    // 直接驱动 world 事件（stones=2，模拟 BOSS 击杀；sim-core unit 已证 BOSS 击杀事件形状）。
    await applyMaterialGainToCharacter(svc, "u-bossmat", seatId, 2);

    const snap = await svc.loadOrCreate("u-bossmat");
    assert.equal(snap.snapshot.character.materials, 2, "BOSS 击杀 → Character.materials = 2");
    const push = invMsg(fc.sent);
    assert.ok(push, "BOSS 击杀后应推送 character.inventory");
    assert.equal(push!.materials, 2, "推送携带 materials=2");
  } finally {
    removeConnection("conn_0"); // 防御清理
  }
});

// ------------------------------------------------------------------
// ③ 游客击杀 → 零持久写 + 不推送（C-Per-1）
// ------------------------------------------------------------------

test("E19: guest kill → zero persistence + no push (C-Per-1)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId: "guest_mat", guest: true });
    const fc = fakeConn("guest_mat");
    registerConnection(fc.conn);
    const world = getWorld(RESIDENT_ROOM_ID)!;
    world.addPlayer(seatId, "guest_mat");

    const elite = world.actors().find((a) => a.tier === 1)!;
    elite.x = 3 * TILE;
    elite.y = 3 * TILE;
    elite.aggression = "passive";
    elite.hp = 1;
    const p = world.actors().find((a) => a.ownerId === seatId)!;
    p.x = 3 * TILE + 60;
    p.y = 3 * TILE;
    world.enqueueInput(seatId, { seq: 1, tick: 0, action: InputAction.SKILL1, dir: 0, skillSlot: 0 });
    world.step();

    await new Promise((r) => setTimeout(r, 350)); // 给 async 落库机会（若错误触发）
    assert.equal(store.saveCount, 0, "游客击杀不落库（C-Per-1）");
    assert.equal(store.loadCount, 0, "游客击杀不 loadOrCreate（C-Per-1）");
    assert.equal(await store.exists("guest_mat"), false, "无游客持久化记录");
    assert.equal(invMsg(fc.sent), undefined, "游客击杀不推送 character.inventory");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
    removeConnection("conn_0");
  }
});
