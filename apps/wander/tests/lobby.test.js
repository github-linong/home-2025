import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  joinRoom,
  movePlayer,
  resizeWorld,
  leaveRoom,
  roomSnapshot,
  validateReconnect,
  markDisconnected,
  getRoomByCode,
  sweepIdleEmptyRooms,
} from "../src/lobby/lobby-service.js";
import { stepPlayer, clampToWorld, isDir } from "../src/lobby/world.js";

test("createRoom makes the owner the first player", () => {
  const room = createRoom("u1", "Alice");
  assert.equal(room.players.size, 1);
  assert.equal(room.ownerId, "u1");
  assert.ok(room.players.has("u1"));
  assert.ok(getRoomByCode(room.roomCode) !== null);
});

test("createRoom honors a preferred (public) code", () => {
  const room = createRoom("u9", "Pub", "PUBLIC");
  assert.equal(room.roomCode, "PUBLIC");
  assert.equal(getRoomByCode("PUBLIC"), room);
});

test("joinRoom re-activates a grace-disconnected player instead of rejecting", () => {
  const room = createRoom("u1", "Alice");
  joinRoom(room, "u2", "Bob");
  // Simulate an unclean disconnect (no room.leave) → player enters grace window.
  markDisconnected(room, "u2");
  assert.equal(room.players.get("u2").status, "disconnected");
  // Same user reconnects (e.g. page refresh) → should rejoin seamlessly.
  const r = joinRoom(room, "u2", "Bob");
  assert.ok(r.ok);
  assert.equal(room.players.get("u2").status, "active");
  assert.equal(room.players.size, 2); // not duplicated into two players
});

test("joinRoom keeps the player's last position on rejoin", () => {
  const room = createRoom("u1", "Alice");
  joinRoom(room, "u2", "Bob");
  const before = room.players.get("u2");
  before.x = 10;
  before.y = 20;
  markDisconnected(room, "u2");
  const r = joinRoom(room, "u2", "Bob");
  assert.ok(r.ok);
  const after = room.players.get("u2");
  assert.equal(after.x, 10);
  assert.equal(after.y, 20);
});

test("movePlayer steps one cell, clamps to the wall, and updates facing", () => {
  const room = createRoom("u1", "Alice");
  const p = room.players.get("u1");
  p.x = 0;
  p.y = 0;
  const up = movePlayer(room, "u1", "up");
  assert.ok(up.ok);
  assert.equal(p.y, 0, "blocked at top wall");
  const right = movePlayer(room, "u1", "right");
  assert.ok(right.ok);
  assert.equal(p.x, 1);
  assert.equal(p.facing, "right");
});

test("movePlayer supports 8-directional diagonal steps", () => {
  const room = createRoom("u1", "Alice");
  const p = room.players.get("u1");
  p.x = 5;
  p.y = 5;
  const d = movePlayer(room, "u1", "up-left");
  assert.ok(d.ok);
  assert.equal(p.x, 4, "x steps -1 on a diagonal");
  assert.equal(p.y, 4, "y steps -1 on a diagonal");
  assert.equal(p.facing, "up-left");
  // A diagonal into the left wall slides up (free axis) instead of stalling.
  p.x = 0;
  p.y = 5;
  const slide = movePlayer(room, "u1", "up-left");
  assert.ok(slide.ok);
  assert.equal(p.x, 0, "x clamped at the left wall");
  assert.equal(p.y, 4, "y still moves up");
});

test("movePlayer rejects an invalid direction", () => {
  const room = createRoom("u1", "Alice");
  const res = movePlayer(room, "u1", "diagonal");
  assert.equal(res.code, "INVALID_ACTION");
});

test("resizeWorld is owner-only and clamps players into the new bounds", () => {
  const room = createRoom("u1", "Alice");
  joinRoom(room, "u2", "Bob");
  const notOwner = resizeWorld(room, "u2", 2000, 2000);
  assert.equal(notOwner.code, "NOT_OWNER");
  const p = room.players.get("u1");
  p.x = 999;
  p.y = 999;
  const ok = resizeWorld(room, "u1", 50, 50);
  assert.ok(ok.ok);
  assert.equal(room.world.w, 50);
  assert.equal(p.x, 49, "player clamped into smaller world");
});

test("leaveRoom transfers ownership to another active player", () => {
  const room = createRoom("u1", "Alice");
  joinRoom(room, "u2", "Bob");
  const res = leaveRoom(room, "u1");
  assert.ok(res.ok);
  assert.equal(room.ownerId, "u2");
  assert.equal(room.players.size, 1);
});

test("roomSnapshot carries players and world bounds", () => {
  const room = createRoom("u1", "Alice");
  const snap = roomSnapshot(room);
  assert.equal(snap.type, "room.snapshot");
  assert.equal(snap.players.length, 1);
  assert.equal(snap.world.w, room.world.w);
});

test("validateReconnect restores an active player and rejects a bad token", () => {
  const room = createRoom("u1", "Alice");
  const p = room.players.get("u1");
  p.status = "disconnected";
  const ok = validateReconnect(room, "u1", p.reconnectToken);
  assert.ok(ok.ok);
  assert.equal(room.players.get("u1").status, "active");
  const bad = validateReconnect(room, "u1", "wrong-token");
  assert.equal(bad.code, "SESSION_EXPIRED");
});

test("sweepIdleEmptyRooms destroys rooms with no active players", () => {
  const room = createRoom("u1", "Alice");
  leaveRoom(room, "u1"); // removes the only player
  assert.equal(room.players.size, 0);
  room.lastActivityAt = Date.now() - 60 * 60 * 1000;
  const swept = sweepIdleEmptyRooms();
  assert.ok(swept.includes(room.roomId));
});

test("world helpers: clampToWorld + isDir", () => {
  assert.deepEqual(clampToWorld(-3, 5000, { w: 1000, h: 1000 }), { x: 0, y: 999 });
  assert.equal(isDir("up"), true);
  assert.equal(isDir("up-left"), true);
  assert.equal(isDir("northeast"), false);
  const p = { x: 5, y: 5, facing: "down" };
  const res = stepPlayer(p, "left", { w: 1000, h: 1000 });
  assert.equal(res.moved, true);
  assert.equal(p.x, 4);
  assert.equal(p.facing, "left");
});
