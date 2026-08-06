/**
 * protocol.test.ts — E1.S1.2 / S1.6 纯分派单测（无 ws）
 * 用 fake RunManager 验证 room.create/join/transferOwner/game.start/reconnect/sync 的回复与广播。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "../src/protocol.ts";
import type { RunManager } from "../src/run-manager.ts";
import { getRoom } from "../src/room-service.ts";
import type { WorldSnapshot, InputCmd } from "../../../packages/sim-core/src/types.ts";

function fakeRunManager(): RunManager {
  const store = new Map<string, WorldSnapshot>();
  const running = new Set<string>();
  return {
    startRun(roomId, opts) {
      const snap: WorldSnapshot = {
        tick: 0,
        runId: opts.runId,
        roomPhase: 1,
        entities: [],
      };
      store.set(roomId, snap);
      running.add(roomId);
      return snap;
    },
    stopRun(roomId) {
      running.delete(roomId);
      store.delete(roomId);
    },
    getSnapshot(roomId) {
      const s = store.get(roomId);
      if (!s) return null;
      // 模拟 tick 推进，便于 sync 返回递增 tick。
      store.set(roomId, { ...s, tick: s.tick + 1 });
      return store.get(roomId) ?? null;
    },
    enqueueInput(_roomId: string, _playerId: number, _cmd: InputCmd) {},
    isRunning(roomId) {
      return running.has(roomId);
    },
  };
}

const rm = fakeRunManager();

test("room.create replies ok + broadcasts room.snapshot", () => {
  const res = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "room.create", requestId: "r1", payload: { displayName: "Alice" } },
  );
  assert.equal((res.reply as any).type, "room.create.ok");
  assert.ok((res.reply as any).roomCode);
  assert.ok((res.reply as any).reconnectToken);
  assert.equal(res.roomId, (res.reply as any).roomId);
  assert.equal(res.broadcasts?.[0].kind, "room");
});

test("room.join by code seats the second player", () => {
  const created = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "room.create", requestId: "r1", payload: { displayName: "Alice" } },
  );
  const code = (created.reply as any).roomCode;
  const joined = dispatch(
    { userId: "B", connId: "cB", runManager: rm },
    { type: "room.join", requestId: "r2", payload: { roomCode: code, displayName: "Bob" } },
  );
  assert.equal((joined.reply as any).type, "room.join.ok");
  const room = getRoom((joined.reply as any).roomId);
  assert.equal(room?.seats.filter((s) => s.status !== "empty").length, 2);
});

test("room.join with wrong code errors", () => {
  const res = dispatch(
    { userId: "C", connId: "cC", runManager: rm },
    { type: "room.join", requestId: "r3", payload: { roomCode: "ZZZZZZ" } },
  );
  assert.equal((res.reply as any).error.code, "ROOM_NOT_FOUND");
});

test("game.start launches a run (world) for the room", () => {
  const created = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "room.create", requestId: "r1", payload: { displayName: "Alice" } },
  );
  const roomId = (created.reply as any).roomId;
  const started = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "game.start", requestId: "r4", payload: { roomId } },
  );
  assert.equal((started.reply as any).type, "game.start.ok");
  assert.ok((started.reply as any).runId);
  assert.ok(rm.isRunning(roomId));
});

test("S1.6 reconnect with valid token returns ok + pulls world snapshot when run active", () => {
  const created = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "room.create", requestId: "r1", payload: { displayName: "Alice" } },
  );
  const roomId = (created.reply as any).roomId;
  const token = (created.reply as any).reconnectToken;
  dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "game.start", requestId: "r4", payload: { roomId } },
  );
  const reconnect = dispatch(
    { userId: "A", connId: "cA2", runManager: rm },
    {
      type: "session.reconnect",
      requestId: "r5",
      payload: { roomId, seatIndex: 0, reconnectToken: token, runId: (created.reply as any).runId },
    },
  );
  assert.equal((reconnect.reply as any).type, "session.reconnect.ok");
  // 运行中的房：重连应额外广播全量 WorldSnapshot（数据面 binary）。
  const worldBroadcast = reconnect.broadcasts?.find(
    (b) => b.kind === "room" && (b as any).binary === true,
  );
  assert.ok(worldBroadcast, "active run reconnect must pull full WorldSnapshot");
});

test("S1.6 reconnect with wrong token errors", () => {
  const created = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "room.create", requestId: "r1", payload: { displayName: "Alice" } },
  );
  const roomId = (created.reply as any).roomId;
  const res = dispatch(
    { userId: "A", connId: "cA2", runManager: rm },
    {
      type: "session.reconnect",
      requestId: "r6",
      payload: { roomId, seatIndex: 0, reconnectToken: "bad", runId: null },
    },
  );
  assert.equal((res.reply as any).error.code, "RECONNECT_EXPIRED");
});

test("sync.request returns full world snapshot to the requesting conn", () => {
  const created = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "room.create", requestId: "r1", payload: { displayName: "Alice" } },
  );
  const roomId = (created.reply as any).roomId;
  dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "game.start", requestId: "r4", payload: { roomId } },
  );
  const sync = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "sync.request", requestId: "r7", payload: { roomId } },
  );
  assert.equal((sync.reply as any).type, "sync.request.ok");
  const toConn = sync.broadcasts?.find((b) => b.kind === "conn");
  assert.ok(toConn, "sync must deliver snapshot to the conn");
});

test("unknown message type errors", () => {
  const res = dispatch(
    { userId: "A", connId: "cA", runManager: rm },
    { type: "nope", requestId: "r8", payload: {} },
  );
  assert.equal((res.reply as any).error.code, "INVALID_ACTION");
});
