import { config } from "../config.js";
import { generateId, generateRoomCode, generateReconnectToken } from "../core/ids.js";
import { ErrorCodes, makeError } from "../protocol/errors.js";
import { PLAYER_COLORS, pickColor, isDir, stepPlayer } from "./world.js";

/** @type {Map<string, Room>} */
export const rooms = new Map();
/** @type {Map<string, string>} roomCode -> roomId */
const roomCodes = new Map();

/** @type {((room: Room) => void) | null} */
let roomChangeListener = null;

/** Gateway registers this to broadcast room.snapshot on presence changes. */
export function setRoomChangeListener(fn) {
  roomChangeListener = fn;
}

function notifyRoomChanged(room) {
  roomChangeListener?.(room);
}

export function getRoom(roomId) {
  return rooms.get(roomId) ?? null;
}

export function getRoomByCode(code) {
  const roomId = roomCodes.get(String(code).toUpperCase());
  return roomId ? rooms.get(roomId) : null;
}

export function bumpRoomVersion(room) {
  room.stateVersion += 1;
  room.lastActivityAt = Date.now();
}

function usedColors(room) {
  const s = new Set();
  for (const p of room.players.values()) s.add(p.color);
  return s;
}

function randomSpawn(world) {
  const m = config.spawnMargin;
  const w = Math.max(1, world.w - m * 2);
  const h = Math.max(1, world.h - m * 2);
  return {
    x: m + Math.floor(Math.random() * w),
    y: m + Math.floor(Math.random() * h),
  };
}

function makePlayer(room, userId, displayName) {
  const color = pickColor(usedColors(room));
  const spawn = randomSpawn(room.world);
  return {
    userId,
    displayName: displayName || `Player-${String(userId).slice(-4)}`,
    color,
    x: spawn.x,
    y: spawn.y,
    facing: "down",
    status: "active",
    joinedAt: Date.now(),
    lastMoveAt: Date.now(),
    reconnectToken: generateReconnectToken(),
    reconnectTokenExpires: Date.now() + config.reconnectTokenTtlMs,
    disconnectTimer: null,
    disconnectedAt: null,
  };
}

export function createRoom(ownerId, ownerName, preferredCode = null) {
  let roomCode = preferredCode ? String(preferredCode).toUpperCase() : null;
  if (roomCode && roomCodes.has(roomCode)) roomCode = null; // preferred taken → fall back
  if (!roomCode) {
    roomCode = generateRoomCode(config.roomCodeLength);
    for (let i = 0; i < 3; i += 1) {
      if (!roomCodes.has(roomCode)) break;
      roomCode = generateRoomCode(config.roomCodeLength);
    }
  }

  const roomId = generateId("room");
  const room = {
    roomId,
    roomCode,
    ownerId,
    world: { w: config.worldWidth, h: config.worldHeight },
    players: new Map(),
    stateVersion: 1,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  rooms.set(roomId, room);
  roomCodes.set(roomCode, roomId);

  // Owner is automatically the first player in the room.
  room.players.set(ownerId, makePlayer(room, ownerId, ownerName));
  bumpRoomVersion(room);
  return room;
}

export function joinRoom(room, userId, displayName) {
  const existing = room.players.get(userId);
  if (existing) {
    // Same user (re)joining — e.g. a page refresh within the disconnect-grace
    // window, or a stale player object left behind by an unclean disconnect.
    // Re-activate them in place so they instantly return to the room at their
    // last position/color instead of being rejected with "已经在房间中".
    existing.status = "active";
    if (existing.disconnectTimer) {
      clearTimeout(existing.disconnectTimer);
      existing.disconnectTimer = null;
    }
    existing.disconnectedAt = null;
    if (displayName) existing.displayName = displayName;
    existing.reconnectToken = generateReconnectToken();
    existing.reconnectTokenExpires = Date.now() + config.reconnectTokenTtlMs;
    bumpRoomVersion(room);
    return { ok: true };
  }
  if (room.players.size >= config.maxPlayersPerRoom) return makeError(ErrorCodes.ROOM_FULL);
  room.players.set(userId, makePlayer(room, userId, displayName));
  bumpRoomVersion(room);
  return { ok: true };
}

export function leaveRoom(room, userId) {
  const player = room.players.get(userId);
  if (!player) return makeError(ErrorCodes.NOT_IN_ROOM);
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  const wasOwner = room.ownerId === userId;
  room.players.delete(userId);
  if (wasOwner) {
    const next = [...room.players.values()].find((p) => p.status === "active");
    if (next) room.ownerId = next.userId;
  }
  bumpRoomVersion(room);
  notifyRoomChanged(room);
  return { ok: true };
}

export function movePlayer(room, userId, dir) {
  const player = room.players.get(userId);
  if (!player) return makeError(ErrorCodes.NOT_IN_ROOM);
  if (player.status !== "active") return makeError(ErrorCodes.INVALID_ACTION, "当前不在线");
  if (!isDir(dir)) return makeError(ErrorCodes.INVALID_ACTION, "方向无效");
  const res = stepPlayer(player, dir, room.world);
  if (res.error) return makeError(ErrorCodes.INVALID_ACTION, res.error);
  bumpRoomVersion(room);
  notifyRoomChanged(room);
  return { ok: true, moved: res.moved, player };
}

/**
 * Enlarge (or shrink, within [1, maxWorldSize]) the world bounds. Coordinates
 * are data fields, so this is what makes the map "effectively infinite" — the
 * owner can keep growing it. Players are clamped back inside the new bounds.
 */
export function resizeWorld(room, userId, w, h) {
  if (room.ownerId !== userId) return makeError(ErrorCodes.NOT_OWNER);
  const nw = Math.max(1, Math.min(Math.trunc(Number(w)) || room.world.w, config.maxWorldSize));
  const nh = Math.max(1, Math.min(Math.trunc(Number(h)) || room.world.h, config.maxWorldSize));
  room.world = { w: nw, h: nh };
  for (const p of room.players.values()) {
    p.x = Math.max(0, Math.min(nw - 1, p.x));
    p.y = Math.max(0, Math.min(nh - 1, p.y));
  }
  bumpRoomVersion(room);
  notifyRoomChanged(room);
  return { ok: true, world: room.world };
}

export function publicPlayer(p) {
  return {
    userId: p.userId,
    displayName: p.displayName,
    color: p.color,
    x: p.x,
    y: p.y,
    facing: p.facing,
    status: p.status,
  };
}

/** Full snapshot broadcast to (or requested by) a connection. */
export function roomSnapshot(room) {
  return {
    type: "room.snapshot",
    protocolVersion: config.protocolVersion,
    roomId: room.roomId,
    roomCode: room.roomCode,
    ownerId: room.ownerId,
    world: { ...room.world },
    stateVersion: room.stateVersion,
    players: [...room.players.values()].map(publicPlayer),
  };
}

export function validateReconnect(room, userId, reconnectToken) {
  const player = room.players.get(userId);
  if (!player) return makeError(ErrorCodes.NOT_IN_ROOM);
  if (!player.reconnectToken || player.reconnectToken !== reconnectToken) {
    return makeError(ErrorCodes.SESSION_EXPIRED);
  }
  if (player.reconnectTokenExpires && player.reconnectTokenExpires < Date.now()) {
    return makeError(ErrorCodes.SESSION_EXPIRED);
  }
  player.status = "active";
  player.reconnectToken = generateReconnectToken();
  player.reconnectTokenExpires = Date.now() + config.reconnectTokenTtlMs;
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
  player.disconnectedAt = null;
  bumpRoomVersion(room);
  notifyRoomChanged(room);
  return { ok: true, reconnectToken: player.reconnectToken };
}

export function markDisconnected(room, userId) {
  const player = room.players.get(userId);
  if (!player || player.status === "disconnected") return;
  player.status = "disconnected";
  player.disconnectedAt = Date.now();
  bumpRoomVersion(room);
  notifyRoomChanged(room);

  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  player.disconnectTimer = setTimeout(() => {
    if (player.status !== "disconnected" || !room.players.has(userId)) return;
    const wasOwner = room.ownerId === userId;
    room.players.delete(userId);
    if (wasOwner) {
      const next = [...room.players.values()].find((p) => p.status === "active");
      if (next) room.ownerId = next.userId;
    }
    bumpRoomVersion(room);
    notifyRoomChanged(room);
  }, config.disconnectGraceMs);
  player.disconnectTimer.unref?.();
}

export function clearDisconnectTimer(room, userId) {
  const player = room.players.get(userId);
  if (player?.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

export function destroyRoom(room) {
  for (const p of room.players.values()) {
    if (p.disconnectTimer) {
      clearTimeout(p.disconnectTimer);
      p.disconnectTimer = null;
    }
  }
  roomCodes.delete(room.roomCode);
  rooms.delete(room.roomId);
}

/**
 * GC rooms that have no active players and have been idle past roomIdleTtlMs.
 * @returns {string[]} destroyed roomIds
 */
export function sweepIdleEmptyRooms(now = Date.now()) {
  const swept = [];
  for (const room of [...rooms.values()]) {
    // The public room is a stable landmark — never GC it.
    if (room.roomCode === config.publicRoomCode) continue;
    const hasActive = [...room.players.values()].some((p) => p.status === "active");
    if (hasActive) continue;
    if (now - room.lastActivityAt < config.roomIdleTtlMs) continue;
    destroyRoom(room);
    swept.push(room.roomId);
  }
  return swept;
}
