/**
 * room-service.test.ts — E1.S1.1 / S1.5 / S1.6 房间服务单测
 * 复用 poker lobby-service.js 语义；覆盖好友房码 / 邀请 / co-host / 重连 / RESIDENT 排除 GC。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  getRoomByCode,
  getRoom,
  confirmSeat,
  lockSeat,
  transferOwner,
  validateReconnect,
  markDisconnected,
  sweepIdleEmptyRooms,
  ensureResidentRoom,
  roomSnapshot,
  type Room,
} from "../src/room-service.ts";
import { config } from "../src/config.ts";

function freshRoom(owner = "owner_a"): Room {
  return createRoom(owner, "Owner");
}

test("S1.1 friend room: 6-digit code is unique and resolvable", () => {
  const r1 = freshRoom();
  const r2 = freshRoom("owner_b");
  assert.equal(r1.roomCode.length, config.roomCodeLength);
  assert.notEqual(r1.roomCode, r2.roomCode);
  assert.equal(getRoomByCode(r1.roomCode), r1);
  assert.equal(getRoom(r1.roomId), r1);
});

test("S1.1 invite token present and stable per room", () => {
  const r = freshRoom();
  assert.match(r.inviteToken, /^[0-9a-f]{64}$/);
  assert.equal(roomSnapshot(r).inviteToken, r.inviteToken);
});

test("S1.1 seat confirm issues reconnect token", () => {
  const r = freshRoom();
  lockSeat(r, "owner_a", 0);
  const { reconnectToken } = confirmSeat(r, "owner_a", "Owner", 0);
  assert.match(reconnectToken, /^[0-9a-f]{64}$/);
});

test("S1.1 co-host migration: transferOwner moves ownership", () => {
  const r = freshRoom("owner_a");
  lockSeat(r, "owner_a", 0);
  confirmSeat(r, "owner_a", "Owner", 0);
  lockSeat(r, "guest_b", 1);
  confirmSeat(r, "guest_b", "Guest", 1);
  const { ownerId } = transferOwner(r, "owner_a", "guest_b");
  assert.equal(ownerId, "guest_b");
  assert.equal(r.ownerId, "guest_b");
});

test("S1.6 reconnect: valid token re-admits, wrong token rejected", () => {
  const r = freshRoom();
  lockSeat(r, "owner_a", 0);
  const { reconnectToken } = confirmSeat(r, "owner_a", "Owner", 0);
  const ok = validateReconnect(r, "owner_a", 0, reconnectToken, null);
  assert.match(ok.reconnectToken, /^[0-9a-f]{64}$/);
  assert.throws(() => validateReconnect(r, "owner_a", 0, "wrong", null));
});

test("S1.5 RESIDENT singleton is excluded from idle sweep", () => {
  const resident = ensureResidentRoom();
  // 制造一个空好友房并老化。
  const friend = freshRoom("idle_owner");
  friend.lastActivityAt = Date.now() - config.roomIdleTtlMs - 1000;
  const swept = sweepIdleEmptyRooms();
  assert.ok(swept.includes(friend.roomId), "idle friend room should be swept");
  assert.ok(!swept.includes(resident.roomId), "RESIDENT must never be swept");
});

test("S1.5 RESIDENT singleton persists across calls", () => {
  const a = ensureResidentRoom();
  const b = ensureResidentRoom();
  assert.equal(a.roomId, b.roomId);
  assert.equal(a.resident, true);
});

test("S1.1 markDisconnected flags seat (grace handled by timer)", () => {
  const r = freshRoom();
  lockSeat(r, "owner_a", 0);
  confirmSeat(r, "owner_a", "Owner", 0);
  markDisconnected(r, "owner_a");
  const seat = r.seats[0];
  assert.equal(seat.status, "disconnected");
  assert.ok(seat.disconnectedAt !== null);
});
