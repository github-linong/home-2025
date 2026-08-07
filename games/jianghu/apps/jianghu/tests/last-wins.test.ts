/**
 * last-wins.test.ts — last-wins 顶替（C-Per-4）：连接级踢旧 + member 状态机原子接管
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureResidentRoom,
  joinResident,
  enforceLastWins,
  RESIDENT_ROOM_ID,
  getRoom,
} from "../src/room-service.ts";
import { registerConnection, removeConnection, type Conn } from "../src/connection-registry.ts";

function fakeConn(userId: string) {
  const sent: { type: string; [k: string]: unknown }[] = [];
  const conn: Conn = {
    connId: "",
    userId,
    roomId: null,
    send(payload: string | Uint8Array, _opts?: { binary?: boolean }) {
      sent.push(JSON.parse(payload as string) as { type: string });
    },
  };
  return { conn, sent };
}

test("enforceLastWins: already-occupied member → no reclaim needed", () => {
  ensureResidentRoom();
  const room = getRoom(RESIDENT_ROOM_ID)!;
  room.members.delete("lw1"); // 隔离单例房间
  joinResident("lw1");
  const { reclaimed } = enforceLastWins(RESIDENT_ROOM_ID, "lw1");
  assert.equal(reclaimed, false, "already occupied → nothing to reclaim");
  assert.equal(room.members.get("lw1")!.status, "occupied");
});

test("enforceLastWins: disconnected old member reclaimed atomically (C-Per-4)", () => {
  ensureResidentRoom();
  const room = getRoom(RESIDENT_ROOM_ID)!;
  room.members.delete("lw2"); // 隔离单例房间
  joinResident("lw2");
  // 模拟旧会话断开遗留的 disconnected member（旧连接已关闭）。
  room.members.get("lw2")!.status = "disconnected";

  const before = room.members.get("lw2");
  const { reclaimed } = enforceLastWins(RESIDENT_ROOM_ID, "lw2");
  assert.equal(reclaimed, true, "disconnected member reclaimed");
  const after = room.members.get("lw2")!;
  assert.equal(after.status, "occupied", "reclaimed to occupied (takeover)");
  // 复用同一条目（单一 member，绝不新增第二条 → 无双会话并存）。
  assert.equal(after, before, "same single member entry — no dual session created");
});

test("C-Per-4 (connection-level): duplicate user connection kicks the old one", () => {
  const oldC = fakeConn("dup");
  const newC = fakeConn("dup");
  registerConnection(oldC.conn);
  registerConnection(newC.conn);
  assert.equal(oldC.sent.length, 1);
  assert.equal(oldC.sent[0].type, "session.kicked", "old connection kicked by last-wins");
  removeConnection(newC.conn.connId);
});
