import { config } from "../config.js";
import { generateId, generateRoomCode, generateReconnectToken } from "../core/ids.js";
import { createEmptySeats } from "../match/hand-engine.js";
import { ErrorCodes, makeError } from "../protocol/errors.js";

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

function emptySeat(seatIndex) {
  return {
    seatIndex,
    userId: null,
    displayName: null,
    status: "empty",
    ready: false,
    stack: 0,
    reservedBy: null,
    reservedUntil: null,
    reconnectToken: null,
    reconnectTokenExpires: null,
    isBot: false,
    leaveAfterHand: false,
    disconnectTimer: null,
    disconnectedAt: null,
  };
}

export function isBotUserId(userId) {
  return typeof userId === "string" && userId.startsWith("bot_");
}

export function isHumanSeat(seat) {
  return Boolean(seat?.userId && !seat.isBot && !isBotUserId(seat.userId));
}

export function effectiveOwnerId(room) {
  return room.actingOwnerId ?? room.ownerId;
}

/** Pick a seated human (not leaveAfterHand) for temporary owner duties. */
export function pickActingOwner(room, excludeUserId = null) {
  const human = room.seats.find(
    (s) =>
      isHumanSeat(s) &&
      ["occupied", "ready", "disconnected"].includes(s.status) &&
      !s.leaveAfterHand &&
      s.userId !== excludeUserId,
  );
  return human?.userId ?? null;
}

export function refreshActingOwner(room) {
  const ownerSeat = room.seats.find((s) => s.userId === room.ownerId);
  const ownerPresent =
    ownerSeat &&
    !ownerSeat.leaveAfterHand &&
    ["occupied", "ready"].includes(ownerSeat.status);

  if (ownerPresent) {
    if (room.actingOwnerId) {
      room.actingOwnerId = null;
      bumpRoomVersion(room);
    }
    return;
  }

  const next = pickActingOwner(room, room.ownerId);
  if (room.actingOwnerId !== next) {
    room.actingOwnerId = next;
    bumpRoomVersion(room);
  }
}

export function clearActingOwnerIfOwnerReturned(room, userId) {
  if (userId === room.ownerId && room.actingOwnerId) {
    room.actingOwnerId = null;
    bumpRoomVersion(room);
  }
}

export function createRoom(ownerId, ownerName) {
  let roomCode = generateRoomCode(config.roomCodeLength);
  for (let i = 0; i < 3; i += 1) {
    if (!roomCodes.has(roomCode)) break;
    roomCode = generateRoomCode(config.roomCodeLength);
  }

  const roomId = generateId("room");
  const seats = createEmptySeats(config.maxSeats).map((s) => ({
    ...emptySeat(s.seatIndex),
  }));

  const room = {
    roomId,
    roomCode,
    ownerId,
    actingOwnerId: null,
    roomState: "seatingOpen",
    roomVersion: 1,
    seats,
    matchId: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  rooms.set(roomId, room);
  roomCodes.set(roomCode, roomId);
  return room;
}

export function getRoomByCode(code) {
  const roomId = roomCodes.get(code.toUpperCase());
  return roomId ? rooms.get(roomId) : null;
}

export function getRoom(roomId) {
  return rooms.get(roomId) ?? null;
}

export function bumpRoomVersion(room) {
  room.roomVersion += 1;
  room.lastActivityAt = Date.now();
}

export function seatedCount(room) {
  return room.seats.filter((s) =>
    ["occupied", "ready", "disconnected"].includes(s.status),
  ).length;
}

export function lockSeat(room, userId, seatIndex) {
  const seat = room.seats[seatIndex];
  if (!seat) return makeError(ErrorCodes.SEAT_TAKEN, "Invalid seat");
  if (seat.status !== "empty") return makeError(ErrorCodes.SEAT_TAKEN);

  const existingLock = room.seats.find(
    (s) => s.status === "reserved" && s.reservedBy === userId,
  );
  if (existingLock) return makeError(ErrorCodes.SEAT_TAKEN, "Already holding a lock");

  seat.status = "reserved";
  seat.reservedBy = userId;
  seat.reservedUntil = Date.now() + config.seatLockTtlMs;
  bumpRoomVersion(room);
  return { ok: true, seatIndex };
}

export function confirmSeat(room, userId, displayName, seatIndex) {
  const seat = room.seats[seatIndex];
  if (!seat || seat.status !== "reserved" || seat.reservedBy !== userId) {
    return makeError(ErrorCodes.SEAT_TAKEN);
  }

  const midMatch = room.roomState === "inMatch";
  seat.status = midMatch ? "ready" : "occupied";
  seat.userId = userId;
  seat.displayName = displayName;
  seat.stack = config.tableStartStack;
  seat.ready = midMatch;
  seat.isBot = false;
  seat.leaveAfterHand = false;
  seat.reservedBy = null;
  seat.reservedUntil = null;
  seat.reconnectToken = generateReconnectToken();
  seat.reconnectTokenExpires = Date.now() + config.reconnectTokenTtlMs;

  if (seatedCount(room) >= config.minPlayers && room.roomState === "seatingOpen") {
    room.roomState = "waitingReady";
  }
  clearActingOwnerIfOwnerReturned(room, userId);
  bumpRoomVersion(room);
  return { ok: true, reconnectToken: seat.reconnectToken };
}

export function releaseExpiredLocks(room) {
  const now = Date.now();
  for (const seat of room.seats) {
    if (seat.status === "reserved" && seat.reservedUntil && seat.reservedUntil < now) {
      Object.assign(seat, emptySeat(seat.seatIndex));
      bumpRoomVersion(room);
    }
  }
}

export function setReady(room, userId, ready) {
  const seat = room.seats.find((s) => s.userId === userId);
  if (!seat || !["occupied", "ready"].includes(seat.status)) {
    return makeError(ErrorCodes.NOT_SEATED);
  }
  if (!["waitingReady", "readyToStart", "seatingOpen"].includes(room.roomState)) {
    return makeError(ErrorCodes.ROOM_NOT_WAITING);
  }

  seat.ready = ready;
  seat.status = ready ? "ready" : "occupied";

  const seated = room.seats.filter((s) =>
    ["occupied", "ready", "disconnected"].includes(s.status),
  );
  if (seated.length >= config.minPlayers && seated.every((s) => s.ready || s.status === "ready")) {
    room.roomState = "readyToStart";
  } else if (room.roomState === "readyToStart") {
    room.roomState = "waitingReady";
  }
  bumpRoomVersion(room);
  return { ok: true, ready };
}

export function allReady(room) {
  const seated = room.seats.filter((s) =>
    ["occupied", "ready", "disconnected"].includes(s.status),
  );
  return seated.length >= config.minPlayers && seated.every((s) => s.ready);
}

export function clearSeat(room, seatIndex) {
  const prev = room.seats[seatIndex];
  if (prev?.disconnectTimer) {
    clearTimeout(prev.disconnectTimer);
  }
  room.seats[seatIndex] = emptySeat(seatIndex);
}

export function addBotSeat(room) {
  const seatIndex = room.seats.findIndex((s) => s.status === "empty");
  if (seatIndex === -1) return makeError(ErrorCodes.ROOM_FULL);

  const seat = room.seats[seatIndex];
  const userId = `bot_${room.roomId}_${seatIndex}`;
  seat.status = "ready";
  seat.userId = userId;
  seat.displayName = `Bot ${seatIndex + 1}`;
  seat.stack = config.tableStartStack;
  seat.ready = true;
  seat.isBot = true;
  seat.leaveAfterHand = false;
  seat.reservedBy = null;
  seat.reservedUntil = null;
  seat.reconnectToken = null;
  seat.reconnectTokenExpires = null;

  if (seatedCount(room) >= config.minPlayers && room.roomState === "seatingOpen") {
    room.roomState = "waitingReady";
  }
  if (
    room.roomState === "waitingReady" ||
    room.roomState === "readyToStart" ||
    room.roomState === "seatingOpen"
  ) {
    const seated = room.seats.filter((s) =>
      ["occupied", "ready", "disconnected"].includes(s.status),
    );
    if (seated.length >= config.minPlayers && seated.every((s) => s.ready)) {
      room.roomState = "readyToStart";
    }
  }
  bumpRoomVersion(room);
  return { ok: true, seatIndex, userId };
}

/** Remove highest-index bot. Returns seat info; caller may need match fold. */
export function removeOneBotSeat(room) {
  let target = null;
  for (let i = room.seats.length - 1; i >= 0; i -= 1) {
    const s = room.seats[i];
    if (s.isBot && s.userId) {
      target = s;
      break;
    }
  }
  if (!target) return makeError(ErrorCodes.INVALID_ACTION, "No bot to remove");

  return {
    ok: true,
    seatIndex: target.seatIndex,
    userId: target.userId,
    leaveAfterHand: Boolean(target.leaveAfterHand),
  };
}

export function finalizeRemoveBot(room, seatIndex) {
  clearSeat(room, seatIndex);
  if (seatedCount(room) < config.minPlayers && room.roomState !== "inMatch") {
    room.roomState = "seatingOpen";
  }
  refreshActingOwner(room);
  bumpRoomVersion(room);
}

export function markLeaveAfterHand(room, userId) {
  const seat = room.seats.find((s) => s.userId === userId);
  if (!seat) return makeError(ErrorCodes.NOT_IN_ROOM);
  seat.leaveAfterHand = true;
  if (seat.disconnectTimer) {
    clearTimeout(seat.disconnectTimer);
    seat.disconnectTimer = null;
  }
  refreshActingOwner(room);
  bumpRoomVersion(room);
  return { ok: true, seatIndex: seat.seatIndex };
}

/** After hand settlement: clear leaveAfterHand seats (bot stacks discarded). */
export function clearLeaveAfterHandSeats(room) {
  let cleared = 0;
  for (const seat of room.seats) {
    if (!seat.leaveAfterHand) continue;
    clearSeat(room, seat.seatIndex);
    cleared += 1;
  }
  if (cleared > 0) {
    if (seatedCount(room) < config.minPlayers && room.roomState !== "inMatch") {
      room.roomState = "seatingOpen";
    }
    refreshActingOwner(room);
    bumpRoomVersion(room);
    notifyRoomChanged(room);
  }
  return cleared;
}

/**
 * Lobby leave (not in match) or mark for match leave.
 * In match: marks leaveAfterHand; does not clear seat yet.
 */
export function leaveRoom(room, userId) {
  const seatIndex = room.seats.findIndex((s) => s.userId === userId);
  if (seatIndex === -1) return makeError(ErrorCodes.NOT_IN_ROOM);

  if (room.roomState === "inMatch") {
    markLeaveAfterHand(room, userId);
    notifyRoomChanged(room);
    return { ok: true, leaveAfterHand: true, seatIndex, userId };
  }

  clearSeat(room, seatIndex);
  refreshActingOwner(room);

  if (seatedCount(room) < config.minPlayers) {
    room.roomState = "seatingOpen";
  }
  bumpRoomVersion(room);
  notifyRoomChanged(room);
  return { ok: true };
}

export function transferOwner(room, fromUserId, toUserId) {
  if (room.ownerId !== fromUserId) return makeError(ErrorCodes.NOT_OWNER);
  const target = room.seats.find((s) => s.userId === toUserId);
  if (!target || !isHumanSeat(target)) {
    return makeError(ErrorCodes.INVALID_ACTION, "Target must be a seated human");
  }
  room.ownerId = toUserId;
  room.actingOwnerId = null;
  bumpRoomVersion(room);
  return { ok: true, ownerId: toUserId };
}

/** Fully remove a room from memory (codes + timers). */
export function destroyRoom(room) {
  for (const seat of room.seats) {
    if (seat.disconnectTimer) {
      clearTimeout(seat.disconnectTimer);
      seat.disconnectTimer = null;
    }
  }
  room.roomState = "archived";
  roomCodes.delete(room.roomCode);
  rooms.delete(room.roomId);
}

/**
 * GC empty lobby rooms idle longer than ROOM_IDLE_TTL_MS.
 * @returns {string[]} destroyed roomIds
 */
export function sweepIdleEmptyRooms(now = Date.now()) {
  const swept = [];
  for (const room of [...rooms.values()]) {
    if (room.roomState === "inMatch") continue;
    if (seatedCount(room) > 0) continue;
    if (room.seats.some((s) => s.status === "reserved")) continue;
    if (now - room.lastActivityAt < config.roomIdleTtlMs) continue;
    destroyRoom(room);
    swept.push(room.roomId);
  }
  return swept;
}

export function roomSnapshot(room) {
  return {
    type: "room.snapshot",
    protocolVersion: config.protocolVersion,
    roomId: room.roomId,
    roomCode: room.roomCode,
    stateVersion: room.roomVersion,
    roomState: room.roomState,
    ownerId: room.ownerId,
    actingOwnerId: room.actingOwnerId ?? null,
    matchId: room.matchId,
    seats: room.seats.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      displayName: s.displayName,
      status: s.status,
      ready: s.ready,
      stack: s.stack,
      isBot: Boolean(s.isBot),
      leaveAfterHand: Boolean(s.leaveAfterHand),
    })),
  };
}

export function validateReconnect(room, userId, seatId, reconnectToken, matchId = null) {
  const seat = room.seats[seatId];
  if (!seat || seat.userId !== userId) return makeError(ErrorCodes.SEAT_MISMATCH);
  if (seat.leaveAfterHand) return makeError(ErrorCodes.RECONNECT_EXPIRED);
  if (!seat.reconnectToken || seat.reconnectToken !== reconnectToken) {
    return makeError(ErrorCodes.RECONNECT_EXPIRED);
  }
  if (seat.reconnectTokenExpires && seat.reconnectTokenExpires < Date.now()) {
    return makeError(ErrorCodes.RECONNECT_EXPIRED);
  }
  if (room.matchId && matchId != null && matchId !== "" && matchId !== room.matchId) {
    return makeError(ErrorCodes.MATCH_NOT_FOUND);
  }
  seat.status = seat.ready ? "ready" : "occupied";
  seat.reconnectToken = generateReconnectToken();
  seat.reconnectTokenExpires = Date.now() + config.reconnectTokenTtlMs;
  clearActingOwnerIfOwnerReturned(room, userId);
  bumpRoomVersion(room);
  return { ok: true, reconnectToken: seat.reconnectToken };
}

export function markDisconnected(room, userId) {
  const seat = room.seats.find((s) => s.userId === userId);
  if (!seat || seat.isBot || isBotUserId(userId)) return;
  if (seat.leaveAfterHand) return;
  if (!["occupied", "ready"].includes(seat.status)) return;

  seat.status = "disconnected";
  seat.disconnectedAt = Date.now();
  refreshActingOwner(room);
  bumpRoomVersion(room);
  notifyRoomChanged(room);

  if (seat.disconnectTimer) clearTimeout(seat.disconnectTimer);
  seat.disconnectTimer = setTimeout(() => {
    if (seat.status !== "disconnected" || seat.userId !== userId) return;
    const index = seat.seatIndex;
    clearSeat(room, index);
    refreshActingOwner(room);
    if (seatedCount(room) < config.minPlayers && room.roomState !== "inMatch") {
      room.roomState = "seatingOpen";
    }
    bumpRoomVersion(room);
    notifyRoomChanged(room);
  }, config.disconnectGraceMs);
  seat.disconnectTimer.unref?.();
}

export function clearDisconnectTimer(room, userId) {
  const seat = room.seats.find((s) => s.userId === userId);
  if (seat?.disconnectTimer) {
    clearTimeout(seat.disconnectTimer);
    seat.disconnectTimer = null;
  }
  if (seat) seat.disconnectedAt = null;
}
