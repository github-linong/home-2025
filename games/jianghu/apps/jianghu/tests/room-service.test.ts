/**
 * room-service.test.ts — RESIDENT 常驻 + 副本 instance + 重连（C5 / C-Net-3 / C-Dgn-2）
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureResidentRoom,
  createInstanceRoom,
  getRoom,
  getInstanceRoom,
  joinResident,
  joinInstance,
  validateReconnect,
  markDisconnected,
  sweepIdleEmptyRooms,
  RESIDENT_ROOM_ID,
  leaveRoom,
  destroyRoom,
  isMember,
} from "../src/room-service.ts";

test("RESIDENT is a process singleton (C5 sticky single default room)", () => {
  const a = ensureResidentRoom();
  const b = ensureResidentRoom();
  assert.equal(a.roomId, RESIDENT_ROOM_ID);
  assert.equal(a, b, "same singleton instance");
  assert.equal(a.resident, true);
});

test("anyone can join RESIDENT (open world, no code)", () => {
  const room = joinResident("u1");
  assert.equal(room.resident, true);
  assert.ok(room.members.has("u1"));
  const tok = room.members.get("u1")!.reconnectToken;
  assert.match(tok, /^[0-9a-f]{64}$/, "reconnect token is 32-byte hex");
});

test("instance room created locked; second joiner rejected (C-Dgn-2)", () => {
  const room = createInstanceRoom(["owner"]);
  assert.equal(room.resident, false);
  assert.equal(room.locked, true, "members locked on creation");
  const ok = joinInstance(room.roomId, "intruder");
  assert.equal(ok.ok, false, "locked instance rejects late joiner");
  assert.equal(room.members.size, 1);
});

test("createInstanceRoom locks all members; getInstanceRoom/isMember reflect them", () => {
  const room = createInstanceRoom(["a", "b", "c"]);
  assert.equal(room.locked, true);
  assert.equal(room.members.size, 3);
  assert.ok(room.members.has("a") && room.members.has("b") && room.members.has("c"));
  const same = getInstanceRoom(room.roomId);
  assert.equal(same, room, "getInstanceRoom returns instance room");
  assert.equal(getInstanceRoom(RESIDENT_ROOM_ID), null, "RESIDENT is not an instance room");
  assert.equal(isMember(room.roomId, "a"), true);
  assert.equal(isMember(room.roomId, "stranger"), false);
  assert.equal(isMember("no_such_room", "a"), false);
  // 锁定后 members[] 不可变：joinInstance 拒绝任何非成员（C-Dgn-2）。
  assert.equal(joinInstance(room.roomId, "d").ok, false);
  assert.equal(room.members.size, 3, "members unchanged after rejected join");
});

test("reconnect token rotates and validates (chat model, C-Net-3)", () => {
  const room = joinResident("u2");
  const tok = room.members.get("u2")!.reconnectToken;
  const next = validateReconnect(room.roomId, "u2", tok);
  assert.notEqual(next.reconnectToken, tok, "token rotates on reconnect");
  // old token now invalid
  assert.throws(() => validateReconnect(room.roomId, "u2", tok), /RECONNECT_EXPIRED/);
});

test("markDisconnected sets status; sweep excludes RESIDENT (C5)", () => {
  const res = ensureResidentRoom();
  joinResident("u3");
  markDisconnected(res.roomId, "u3");
  assert.equal(res.members.get("u3")!.status, "disconnected");

  // instance room with no members should be swept; RESIDENT never.
  const inst = createInstanceRoom(["owner2"]);
  leaveRoom(inst.roomId, "owner2"); // remove only member
  const swept = sweepIdleEmptyRooms(Date.now() + 10 ** 12); // far future → idle
  assert.ok(swept.includes(inst.roomId), "empty instance swept");
  assert.ok(!swept.includes(RESIDENT_ROOM_ID), "RESIDENT never swept");
  assert.ok(getRoom(RESIDENT_ROOM_ID), "RESIDENT still present");
});

test("destroyRoom removes instance", () => {
  const inst = createInstanceRoom(["owner3"]);
  destroyRoom(inst.roomId);
  assert.equal(getRoom(inst.roomId), null);
});
