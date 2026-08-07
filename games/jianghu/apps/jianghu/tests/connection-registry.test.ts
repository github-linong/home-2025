/**
 * connection-registry.test.ts — 双平面广播 / 踢重连（C5）
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  registerConnection,
  removeConnection,
  setRoom,
  broadcastControl,
  broadcastData,
  sendToConn,
  kickUser,
  getConnectionsInRoom,
  type Conn,
} from "../src/connection-registry.ts";

/** 控制面已解析消息（至少含显式 type；其余字段走索引签名）。 */
type ParsedMsg = { type: string; [key: string]: unknown };

function fakeConn(userId: string): { conn: Conn; sent: ParsedMsg[]; binarySent: Uint8Array[] } {
  const sent: ParsedMsg[] = [];
  const binarySent: Uint8Array[] = [];
  const conn: Conn = {
    connId: "",
    userId,
    roomId: null,
    send(payload: string | Uint8Array, opts?: { binary?: boolean }) {
      if (opts?.binary) binarySent.push(payload as Uint8Array);
      else sent.push(JSON.parse(payload as string) as ParsedMsg);
    },
  };
  return { conn, sent, binarySent };
}

test("register + broadcast to room (control plane JSON, explicit type)", () => {
  const a = fakeConn("A");
  const b = fakeConn("B");
  registerConnection(a.conn);
  registerConnection(b.conn);
  setRoom(a.conn.connId, "room1");
  setRoom(b.conn.connId, "room1");

  broadcastControl("room1", { type: "room.snapshot", foo: 1 });
  assert.equal(a.sent.length, 1);
  assert.equal(a.sent[0].type, "room.snapshot", "C4: explicit type preserved");
  assert.equal(b.sent.length, 1);
});

test("broadcast only reaches members of the target room (C-Net-1 zero-leak)", () => {
  const a = fakeConn("A");
  const b = fakeConn("B");
  registerConnection(a.conn);
  registerConnection(b.conn);
  setRoom(a.conn.connId, "main");
  setRoom(b.conn.connId, "instance_x");

  broadcastControl("main", { type: "x" });
  assert.equal(a.sent.length, 1);
  assert.equal(b.sent.length, 0, "instance member must not receive main-world broadcast");
});

test("data plane broadcast sends Uint8Array (binary Buffer, C3/C5)", () => {
  const a = fakeConn("A");
  registerConnection(a.conn);
  setRoom(a.conn.connId, "room1");
  const buf = Buffer.from([0x01, 0, 0, 0, 0]);
  broadcastData("room1", buf);
  assert.equal(a.binarySent.length, 1);
  assert.deepEqual([...a.binarySent[0]], [0x01, 0, 0, 0, 0]);
});

test("duplicate connection kicks the old one", () => {
  const old = fakeConn("A");
  const fresh = fakeConn("A");
  registerConnection(old.conn);
  registerConnection(fresh.conn);
  // old should have received a kick
  assert.equal(old.sent.length, 1);
  assert.equal((old.sent[0] as { type: string }).type, "session.kicked");
});

test("kickUser removes connection and notifies room", () => {
  const a = fakeConn("A");
  const b = fakeConn("B");
  registerConnection(a.conn);
  registerConnection(b.conn);
  setRoom(a.conn.connId, "room1");
  setRoom(b.conn.connId, "room1");
  kickUser("A");
  assert.equal(getConnectionsInRoom("room1").length, 1);
  assert.equal(b.sent.length, 1);
  assert.equal((b.sent[0] as { type: string }).type, "session.kicked");
  removeConnection(b.conn.connId);
});

test("sendToConn targets a single connection", () => {
  const a = fakeConn("A");
  registerConnection(a.conn);
  sendToConn(a.conn.connId, { type: "ping" });
  assert.equal(a.sent.length, 1);
  assert.equal(a.sent[0].type, "ping");
});
