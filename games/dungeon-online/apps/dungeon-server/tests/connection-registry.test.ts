/**
 * connection-registry.test.ts — E1.S1.2 连接登记 / 双平面广播单测
 * 用 fake Conn 验证注册 / 重复踢 / 房间广播 / 定点发送，无需真实 ws。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  registerConnection,
  removeConnection,
  setRoom,
  broadcastToRoom,
  sendToConn,
  sendToUser,
  kickUser,
  getConnectionsInRoom,
  type Conn,
  type SendOptions,
} from "../src/connection-registry.ts";

interface FakeConn extends Conn {
  sent: Array<{ msg: unknown; opts?: SendOptions }>;
  closed: boolean;
}

function makeConn(userId: string): FakeConn {
  const conn: FakeConn = {
    connId: "",
    userId,
    roomId: null,
    sent: [],
    closed: false,
    send(msg, opts) {
      this.sent.push({ msg, opts });
    },
    close() {
      this.closed = true;
    },
  };
  registerConnection(conn);
  return conn;
}

test("duplicate connection kicks the previous one", () => {
  const a = makeConn("u1");
  const b = makeConn("u1");
  assert.equal(a.closed, true, "old connection should be closed");
  assert.equal(b.closed, false);
  assert.equal(getConnectionsInRoom("r1").length, 0);
});

test("broadcastToRoom targets only room members, except optional user", () => {
  const u1 = makeConn("u1");
  const u2 = makeConn("u2");
  setRoom(u1.connId, "roomX");
  setRoom(u2.connId, "roomX");
  broadcastToRoom("roomX", { type: "t" }, { exceptUserId: "u1" });
  assert.equal(u1.sent.length, 0);
  assert.equal(u2.sent.length, 1);
  // payload 已由 registry 序列化为 string（Conn 只传输，不二次编码）。
  assert.deepEqual(JSON.parse(u2.sent[0].msg as string), { type: "t" });
});

test("data-plane broadcast serializes to Buffer (R1 placeholder binary)", () => {
  const u1 = makeConn("u1");
  setRoom(u1.connId, "roomY");
  broadcastToRoom("roomY", { type: "snap" }, { binary: true });
  const payload = u1.sent[0].msg;
  assert.ok(Buffer.isBuffer(payload), "data plane should emit Buffer");
  assert.deepEqual(JSON.parse((payload as Buffer).toString()), { type: "snap" });
});

test("sendToConn / sendToUser route correctly", () => {
  const u1 = makeConn("u1");
  sendToConn(u1.connId, { type: "c" });
  sendToUser("u1", { type: "u" });
  assert.equal(u1.sent.length, 2);
});

test("kickUser closes connection and removes it", () => {
  const u1 = makeConn("u1");
  setRoom(u1.connId, "roomZ");
  const ok = kickUser("u1", "admin");
  assert.equal(ok, true);
  assert.equal(u1.closed, true);
  assert.equal(getConnectionsInRoom("roomZ").length, 0);
});

test("removeConnection cleanup", () => {
  const u1 = makeConn("u1");
  setRoom(u1.connId, "roomW");
  removeConnection(u1.connId);
  assert.equal(getConnectionsInRoom("roomW").length, 0);
});
