/**
 * instance-lifecycle.test.ts — E5 副本实例生命周期（ADR-JH-ENG-03）
 * ===========================================================================
 * 覆盖（无真实 socket，fake Conn 注入 connection-registry）：
 *   - C-Dgn-2：enterInstance 锁 members；第 2 非成员 join 被拒；
 *   - C-Dgn-4：入口冷却 10s 拒绝重复进入；副本寿命 30min 到点自动解散；
 *   - C-Net-1：实例广播仅发 members[]、主世界广播不含实例实体（双向零泄漏，decode 帧断言）；
 *   - C-Net-2：出入本订阅切换原子（单值 roomId，无中间双域/空域）；
 *   - C-Net-3 / C10：重连寿命内恢复实例订阅；实例销毁后回落主世界；
 *   - C-Dgn-1：快照永不携带 seed。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  bootResidentRun,
  enterInstance,
  exitInstance,
  checkInstanceExpiry,
  isInstanceRunning,
  getWorld,
} from "../src/run-manager.ts";
import {
  registerConnection,
  removeConnection,
  setRoom,
  broadcastData,
  type Conn,
} from "../src/connection-registry.ts";
import {
  getRoom,
  getInstanceRoom,
  joinInstance,
  isMember,
  RESIDENT_ROOM_ID,
} from "../src/room-service.ts";
import { dispatch } from "../src/protocol.ts";
import { createWorld } from "../sim-core/src/world.ts";
import { RoomPhase, EntityKind } from "../sim-core/src/types.ts";
import { RESPAWN_POS } from "../sim-core/src/constants.ts";
import { decodeSnapshot } from "../src/protocol-binary.ts";

/** fake Conn：记录控制面 JSON + 数据面二进制（复用 connection-registry.test 模式）。 */
function fakeConn(userId: string): { conn: Conn; sent: { type: string }[]; binarySent: Uint8Array[] } {
  const sent: { type: string }[] = [];
  const binarySent: Uint8Array[] = [];
  const conn: Conn = {
    connId: "",
    userId,
    roomId: null,
    send(payload: string | Uint8Array, opts?: { binary?: boolean }) {
      if (opts?.binary) binarySent.push(payload as Uint8Array);
      else sent.push(JSON.parse(payload as string) as { type: string });
    },
  };
  return { conn, sent, binarySent };
}

/** dispatch 控制面回复（显式 type + 索引签名，C4 形状路由）。 */
type Reply = { type: string; [key: string]: unknown };
function replyOf(r: { reply?: unknown }): Reply | undefined {
  return r.reply as Reply | undefined;
}

// ------------------------------------------------------------------
// C-Dgn-2 成员锁定
// ------------------------------------------------------------------

test("enterInstance creates instance, locks members; 2nd non-member join rejected (C-Dgn-2)", () => {
  bootResidentRun();
  const res = enterInstance(1, [{ seatId: 1, userId: "u-lock" }], { lifetimeMs: 10 ** 12 });
  assert.equal(res.ok, true);
  const instId = res.instanceRoomId!;
  const room = getInstanceRoom(instId);
  assert.ok(room, "instance room exists");
  assert.equal(room.locked, true, "members locked on enter");
  assert.ok(isMember(instId, "u-lock"));
  assert.equal(room.members.size, 1, "members locked to trigger");

  // C-Dgn-2：进入后第 2 人无法加入同实例。
  const late = joinInstance(instId, "u-intruder");
  assert.equal(late.ok, false, "locked instance rejects late joiner");
  assert.equal(room.members.size, 1, "members[] unchanged after rejected join");

  // 实例 world 在跑 + 有刷怪（spawnZones → 敌人/BOSS）。
  assert.equal(isInstanceRunning(instId), true);
  const world = getWorld(instId)!;
  const kinds = world.snapshot().entities.map((e) => e.kind);
  assert.ok(
    kinds.includes(EntityKind.ENEMY) || kinds.includes(EntityKind.BOSS),
    "instance world spawns enemies/boss",
  );

  // C-Dgn-1：快照永不携带 seed（客户端不可知）。
  const snap = world.snapshot() as unknown as Record<string, unknown>;
  assert.equal("seed" in snap, false, "C-Dgn-1: snapshot never carries raw seed");
});

// ------------------------------------------------------------------
// C-Dgn-4 入口冷却
// ------------------------------------------------------------------

test("entrance cooldown rejects repeated enter within 10s (C-Dgn-4)", () => {
  bootResidentRun();
  const a = enterInstance(1, [{ seatId: 1, userId: "u-cd1" }], { lifetimeMs: 10 ** 12 });
  assert.equal(a.ok, true, "first enter allowed");
  const b = enterInstance(1, [{ seatId: 2, userId: "u-cd2" }], { lifetimeMs: 10 ** 12 });
  assert.equal(b.ok, false, "second enter within cooldown rejected");
  assert.equal(b.reason, "ENTRANCE_COOLDOWN");
});

test("world.tryEnterEntrance: first use activates; blocked in window; allowed after (C-Dgn-4)", () => {
  const w = createWorld({ runId: "t", roomId: "t", seed: "t", phase: RoomPhase.OVERWORLD });
  assert.equal(w.tryEnterEntrance(100), true, "first use allowed (activates 10s cooldown)");
  assert.equal(w.tryEnterEntrance(150), false, "blocked inside window (100+120>150)");
  assert.equal(w.tryEnterEntrance(220), true, "allowed after window (220-100>=120)");
  assert.equal(w.tryEnterEntrance(220), false, "cooldown re-armed after second use");
});

// ------------------------------------------------------------------
// C-Dgn-4 副本寿命自动解散
// ------------------------------------------------------------------

test("expired instance auto-exits all members back to resident (C-Dgn-4)", () => {
  bootResidentRun();
  const res = enterInstance(1, [{ seatId: 1, userId: "u-exp" }], { lifetimeMs: 0 }); // 立即过期
  const instId = res.instanceRoomId!;
  assert.equal(isInstanceRunning(instId), true);
  assert.equal(getRoom(instId) !== null, true);

  const expired = checkInstanceExpiry(Date.now() + 1);
  assert.ok(expired.includes(instId), "expired instance dissolved");
  assert.equal(isInstanceRunning(instId), false, "instance run stopped");
  assert.equal(getRoom(instId), null, "instance room destroyed");

  // 出本归位：成员回 RESIDENT 安全区。
  const residentWorld = getWorld(RESIDENT_ROOM_ID)!;
  const player = residentWorld.actors().find((a) => a.ownerId === 1);
  assert.ok(player, "member re-added to resident world");
  assert.equal(Math.round(player!.x), RESPAWN_POS.x, "at safe respawn x");
  assert.equal(Math.round(player!.y), RESPAWN_POS.y, "at safe respawn y");
});

// ------------------------------------------------------------------
// C-Net-1 广播域隔离（双向零泄漏）
// ------------------------------------------------------------------

test("C-Net-1: instance broadcast reaches only instance members; resident only resident (zero-leak)", async () => {
  bootResidentRun();
  const res = enterInstance(1, [{ seatId: 1, userId: "u-net1" }], { lifetimeMs: 10 ** 12 });
  const instId = res.instanceRoomId!;

  const a = fakeConn("u-net1-res");
  const b = fakeConn("u-net1-inst");
  registerConnection(a.conn);
  registerConnection(b.conn);
  setRoom(a.conn.connId, RESIDENT_ROOM_ID); // 主世界成员
  setRoom(b.conn.connId, instId); // 副本成员

  await new Promise((r) => setTimeout(r, 300)); // 等若干 12Hz tick 广播

  assert.ok(a.binarySent.length > 0, "resident member receives resident frames");
  assert.ok(b.binarySent.length > 0, "instance member receives instance frames");

  const kindsA = new Set<number>();
  const kindsB = new Set<number>();
  for (const buf of a.binarySent) for (const e of decodeSnapshot(Buffer.from(buf)).entities) kindsA.add(e.kind);
  for (const buf of b.binarySent) for (const e of decodeSnapshot(Buffer.from(buf)).entities) kindsB.add(e.kind);

  // 主世界广播不含实例实体（无 ENEMY/BOSS）。
  assert.ok(!kindsA.has(EntityKind.ENEMY) && !kindsA.has(EntityKind.BOSS), "resident frames carry no instance enemies");
  // 实例广播不含主世界占位 loot token（实例 lootTokens=0 → 无 LOOT_GROUND）。
  assert.ok(!kindsB.has(EntityKind.LOOT_GROUND), "instance frames carry no resident ambient loot");
  // 实例广播含敌人/BOSS（实例世界 spawnZones）。
  assert.ok(kindsB.has(EntityKind.ENEMY) || kindsB.has(EntityKind.BOSS), "instance frames carry enemies/boss");

  removeConnection(a.conn.connId);
  removeConnection(b.conn.connId);
});

// ------------------------------------------------------------------
// C-Net-2 订阅切换原子（经 dispatch + setRoom）
// ------------------------------------------------------------------

test("C-Net-2: enter/exit subscription switch is atomic (single room, no double/empty domain)", () => {
  bootResidentRun();
  const a = fakeConn("u-net2");
  registerConnection(a.conn);
  setRoom(a.conn.connId, RESIDENT_ROOM_ID);

  // 进入：dispatch dungeon.enter → roomId=instance；setRoom 单值原子切换。
  const enterRes = dispatch(
    { userId: "u-net2", connId: a.conn.connId, seatId: 1, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.enter", requestId: "e1", payload: { entranceId: 1 } },
  );
  assert.equal(replyOf(enterRes)?.type, "dungeon.enter.ok", "enter acknowledged");
  const instId = enterRes.roomId as string;
  assert.ok(instId && instId !== RESIDENT_ROOM_ID, "switched to instance room");
  setRoom(a.conn.connId, instId);
  assert.equal(a.conn.roomId, instId, "atomic switch to instance (single value)");

  // 进入瞬间：只收 instance 广播，不收 resident（无双域）。
  const bufInst = Buffer.from([0x01, 0, 0, 0, 0]);
  const bufRes = Buffer.from([0x01, 0, 0, 0, 1]);
  broadcastData(instId, bufInst);
  broadcastData(RESIDENT_ROOM_ID, bufRes);
  assert.equal(a.binarySent.length, 1, "only instance frame while in instance");
  assert.deepEqual([...a.binarySent[0]], [...bufInst], "received instance frame, not resident");

  // 退出：dispatch dungeon.exit → roomId=resident；setRoom 原子切回。
  const exitRes = dispatch(
    { userId: "u-net2", connId: a.conn.connId, seatId: 1, roomId: instId },
    { type: "dungeon.exit", requestId: "x1" },
  );
  assert.equal(replyOf(exitRes)?.type, "dungeon.exit.ok", "exit acknowledged");
  assert.equal(exitRes.roomId, RESIDENT_ROOM_ID, "switch target = resident");
  setRoom(a.conn.connId, RESIDENT_ROOM_ID);
  assert.equal(a.conn.roomId, RESIDENT_ROOM_ID, "atomic switch back to resident");

  // 退出瞬间：只收 resident 广播，不收 instance（无空域/双域）。
  a.binarySent.length = 0;
  broadcastData(RESIDENT_ROOM_ID, bufRes);
  broadcastData(instId, bufInst);
  assert.equal(a.binarySent.length, 1, "only resident frame after exit");
  assert.deepEqual([...a.binarySent[0]], [...bufRes], "received resident frame, not instance");

  removeConnection(a.conn.connId);
});

// ------------------------------------------------------------------
// C-Net-3 / C10 重连
// ------------------------------------------------------------------

test("reconnect restores instance within lifetime; falls back to resident when instance gone (C-Net-3/C10)", () => {
  bootResidentRun();
  const res = enterInstance(1, [{ seatId: 1, userId: "u-rec" }], { lifetimeMs: 10 ** 12 });
  const instId = res.instanceRoomId!;
  const room = getInstanceRoom(instId)!;
  const tok = room.members.get("u-rec")!.reconnectToken;

  // 寿命内重连 → 恢复实例订阅（不回落主世界）。
  const r1 = dispatch(
    { userId: "u-rec", connId: "c-rec1", seatId: 1, roomId: instId },
    { type: "session.reconnect", requestId: "r1", payload: { roomId: instId, reconnectToken: tok } },
  );
  assert.equal(replyOf(r1)?.type, "session.reconnect.ok");
  assert.equal((replyOf(r1) as Reply | undefined)?.fellBackToResident, undefined);
  assert.equal(r1.roomId, instId, "restores instance subscription");

  // 实例销毁（解散/超时）→ 重连回落主世界（C-Net-3 / C10）。
  exitInstance(instId);
  assert.equal(getRoom(instId), null, "instance destroyed");
  const r2 = dispatch(
    { userId: "u-rec", connId: "c-rec2", seatId: 1, roomId: instId },
    { type: "session.reconnect", requestId: "r2", payload: { roomId: instId, reconnectToken: tok } },
  );
  assert.equal(replyOf(r2)?.type, "session.reconnect.ok");
  assert.equal((replyOf(r2) as Reply | undefined)?.fellBackToResident, true);
  assert.equal(r2.roomId, RESIDENT_ROOM_ID, "fell back to main world");
});

// ------------------------------------------------------------------
// 防御：dungeon.exit 在非副本房间被拒
// ------------------------------------------------------------------

test("dungeon.exit outside instance is rejected (domain boundary)", () => {
  bootResidentRun();
  const r = dispatch(
    { userId: "u-exit-guard", connId: "c", seatId: 1, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.exit", requestId: "x" },
  );
  assert.equal(replyOf(r)?.type, "game.error");
  assert.equal((replyOf(r) as { type: string; error: { code: string } } | undefined)?.error?.code, "NOT_IN_INSTANCE");
});

test("dungeon.enter outside resident is rejected (domain boundary)", () => {
  bootResidentRun();
  // 先进一个副本（把 conn 挪进 instance），再从 instance 触发 dungeon.enter 应被拒。
  const res = enterInstance(1, [{ seatId: 1, userId: "u-ent-guard" }], { lifetimeMs: 10 ** 12 });
  const r = dispatch(
    { userId: "u-ent-guard", connId: "c", seatId: 1, roomId: res.instanceRoomId! },
    { type: "dungeon.enter", requestId: "e", payload: { entranceId: 2 } },
  );
  assert.equal(replyOf(r)?.type, "game.error");
  assert.equal((replyOf(r) as { type: string; error: { code: string } } | undefined)?.error?.code, "NOT_IN_RESIDENT");
});
