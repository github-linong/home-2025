/**
 * room-service.ts — 联机房间 / 重连 / RESIDENT（E1.S1.1 / S1.5 / S1.6 / C4 / C10）
 *
 * 复用参照（镜像 poker lobby-service.js，不跨仓 import，保持 dungeon-server 自包含）：
 *   apps/poker-realtime/src/lobby/lobby-service.js
 *   - rooms / roomCodes Map、createRoom / getRoomByCode / lockSeat / confirmSeat
 *   - transferOwner（co-host 管理权迁移）、validateReconnect、markDisconnected
 *     （断线宽限 timer）、sweepIdleEmptyRooms、roomSnapshot。
 *   - setRoomChangeListener → presence 变化广播（gateway 注册）。
 *
 * dungeon 差异：
 *   - 座位模型简化（无 stack / bot / leaveAfterHand / ready-to-start 等扑克语义），
 *     仅保留 协作所需字段（userId / reconnectToken / 断线宽限）。
 *   - S1.5 RESIDENT 公共房：进程级单例 + sweep 排除 + 多实例 sticky（sticky 路由 TODO）。
 */

import { config } from "./config.ts";
import {
  generateId,
  generateRoomCode,
  generateReconnectToken,
} from "./core/ids.ts";
import type { World } from "../../../packages/sim-core/src/world.ts";

export type SeatStatus = "empty" | "occupied" | "disconnected";
export type RoomState = "seating" | "active" | "resident" | "archived";

export interface Seat {
  readonly seatIndex: number;
  userId: string | null;
  displayName: string | null;
  status: SeatStatus;
  reconnectToken: string | null;
  reconnectTokenExpires: number | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  disconnectedAt: number | null;
}

export interface Room {
  readonly roomId: string;
  readonly roomCode: string;
  readonly inviteToken: string;
  readonly resident: boolean;
  ownerId: string;
  actingOwnerId: string | null;
  roomState: RoomState;
  roomVersion: number;
  seats: Seat[];
  runId: string | null;
  /** 本房一局地牢 seed（E3 生成；S1.3 启动 run 时填充）。 */
  runSeed: string | null;
  biomeId: number;
  createdAt: number;
  lastActivityAt: number;
}

const rooms = new Map<string, Room>();
const roomCodes = new Map<string, string>(); // roomCode(upper) -> roomId

let roomChangeListener: ((room: Room) => void) | null = null;
export function setRoomChangeListener(fn: (room: Room) => void): void {
  roomChangeListener = fn;
}
function notifyRoomChanged(room: Room): void {
  roomChangeListener?.(room);
}

/**
 * D8（C3/C10）：真实 socket 断线/重连需驱动权威 World 托管钩子（S7.6 三者同发：
 * 跳过 tick + 暂停 DOWNED/救援计时 + 抓拍 PersonalState）。room-service 自身不持有
 * World（避免循环依赖 + 悬挂引用），通过注入的 worldResolver(roomId) 取得 run-manager
 * 持有的权威 World。未注入时静默跳过（防御：不阻断断线/重连流程，且兼容无 run 的纯房间单测）。
 */
let worldResolver: ((roomId: string) => World | null) | null = null;
export function setWorldResolver(
  fn: ((roomId: string) => World | null) | null,
): void {
  worldResolver = fn;
}

/**
 * D8 映射：房间座位 seatIndex === World 玩家 id（createWorld 写入 actor.ownerId，
 * 见 protocol.ts game.start 与 world.ts setDisconnected）。据此驱动托管钩子。
 */
function applyWorldDisconnect(
  room: Room,
  seatIndex: number,
  disconnected: boolean,
): void {
  const world = worldResolver?.(room.roomId);
  if (!world) return; // 无 run / resolver 未注入：跳过（防御，不抛错）。
  // 纪律 B：此处仅调用 World 唯一授权的托管钩子，绝不直改 hp/status。
  world.setDisconnected(seatIndex, disconnected);
}

/** RESIDENT 单例稳定 ID（多实例 sticky 路由的路由键，见 S1.5）。 */
const RESIDENT_ROOM_ID = "room_resident_public";

function emptySeat(seatIndex: number): Seat {
  return {
    seatIndex,
    userId: null,
    displayName: null,
    status: "empty",
    reconnectToken: null,
    reconnectTokenExpires: null,
    disconnectTimer: null,
    disconnectedAt: null,
  };
}

export function createRoom(
  ownerId: string,
  ownerName: string,
  opts: { resident?: boolean; biomeId?: number } = {},
): Room {
  let roomCode = generateRoomCode(config.roomCodeLength);
  for (let i = 0; i < 3; i += 1) {
    if (!roomCodes.has(roomCode)) break;
    roomCode = generateRoomCode(config.roomCodeLength);
  }

  const roomId = opts.resident ? RESIDENT_ROOM_ID : generateId("room");
  const seats: Seat[] = [];
  for (let i = 0; i < config.maxSeats; i += 1) seats.push(emptySeat(i));

  const room: Room = {
    roomId,
    roomCode,
    inviteToken: generateReconnectToken(),
    resident: Boolean(opts.resident),
    ownerId,
    actingOwnerId: null,
    roomState: opts.resident ? "resident" : "seating",
    roomVersion: 1,
    seats,
    runId: null,
    runSeed: null,
    biomeId: opts.biomeId ?? 0,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  if (!opts.resident) {
    rooms.set(roomId, room);
    roomCodes.set(roomCode, roomId);
  }
  return room;
}

/**
 * S1.5 RESIDENT：进程级单例公共房。启动时调用一次；
 * 多实例下所有实例用同一 RESIDENT_ROOM_ID 路由（sticky 由前置 LB 负责，详见 TODO）。
 */
export function ensureResidentRoom(biomeId = 0): Room {
  const existing = rooms.get(RESIDENT_ROOM_ID);
  if (existing && existing.roomState !== "archived") return existing;
  // 重建（进程内单例，仅当异常 archived 后走到这里）。
  roomCodes.delete(existing?.roomCode ?? "");
  const room = createRoom("__resident__", "Public Hub", {
    resident: true,
    biomeId,
  });
  rooms.set(RESIDENT_ROOM_ID, room);
  return room;
}

export function getRoomByCode(code: string): Room | null {
  const roomId = roomCodes.get(code.toUpperCase());
  return roomId ? (rooms.get(roomId) ?? null) : null;
}

export function getRoom(roomId: string): Room | null {
  return rooms.get(roomId) ?? null;
}

export function bumpRoomVersion(room: Room): void {
  room.roomVersion += 1;
  room.lastActivityAt = Date.now();
}

export function seatedCount(room: Room): number {
  return room.seats.filter(
    (s) => s.status === "occupied" || s.status === "disconnected",
  ).length;
}

export function lockSeat(room: Room, userId: string, seatIndex: number): void {
  const seat = room.seats[seatIndex];
  if (!seat || seat.status !== "empty") {
    throw new Error(`SEAT_TAKEN seatIndex=${seatIndex}`);
  }
  // 好友房：直接 confirm，无需显式 lock 阶段；保留接口兼容 poker 语义。
  seat.status = "occupied";
  seat.userId = userId;
  bumpRoomVersion(room);
}

export function confirmSeat(
  room: Room,
  userId: string,
  displayName: string,
  seatIndex: number,
): { reconnectToken: string } {
  const seat = room.seats[seatIndex];
  if (!seat || seat.status !== "occupied" || seat.userId !== userId) {
    throw new Error(`SEAT_MISMATCH seatIndex=${seatIndex}`);
  }
  seat.displayName = displayName;
  seat.reconnectToken = generateReconnectToken();
  seat.reconnectTokenExpires = Date.now() + config.reconnectTokenTtlMs;
  seat.disconnectedAt = null;
  if (seatedCount(room) >= config.minPlayers && room.roomState === "seating") {
    room.roomState = "active";
  }
  bumpRoomVersion(room);
  return { reconnectToken: seat.reconnectToken };
}

export function transferOwner(
  room: Room,
  fromUserId: string,
  toUserId: string,
): { ownerId: string } {
  if (room.ownerId !== fromUserId) throw new Error("NOT_OWNER");
  const target = room.seats.find((s) => s.userId === toUserId);
  if (!target || target.status === "empty") {
    throw new Error("INVALID_ACTION: target must be a seated human");
  }
  room.ownerId = toUserId;
  room.actingOwnerId = null;
  bumpRoomVersion(room);
  return { ownerId: toUserId };
}

export function validateReconnect(
  room: Room,
  userId: string,
  seatIndex: number,
  reconnectToken: string,
  runId: string | null = null,
): { reconnectToken: string } {
  const seat = room.seats[seatIndex];
  if (!seat || seat.userId !== userId) throw new Error("SEAT_MISMATCH");
  if (!seat.reconnectToken || seat.reconnectToken !== reconnectToken) {
    throw new Error("RECONNECT_EXPIRED");
  }
  if (
    seat.reconnectTokenExpires &&
    seat.reconnectTokenExpires < Date.now()
  ) {
    throw new Error("RECONNECT_EXPIRED");
  }
  if (room.runId && runId != null && runId !== "" && runId !== room.runId) {
    throw new Error("RUN_NOT_FOUND");
  }
  seat.status = "occupied";
  seat.reconnectToken = generateReconnectToken();
  seat.reconnectTokenExpires = Date.now() + config.reconnectTokenTtlMs;
  if (seat.disconnectTimer) {
    clearTimeout(seat.disconnectTimer);
    seat.disconnectTimer = null;
  }
  seat.disconnectedAt = null;
  // D8（C10）：恢复权威 World 推进（计时从剩余窗口续算，无跳变）。
  applyWorldDisconnect(room, seat.seatIndex, false);
  bumpRoomVersion(room);
  return { reconnectToken: seat.reconnectToken };
}

export function markDisconnected(room: Room, userId: string): void {
  const seat = room.seats.find((s) => s.userId === userId);
  if (!seat || seat.status !== "occupied") return;
  seat.status = "disconnected";
  seat.disconnectedAt = Date.now();
  bumpRoomVersion(room);
  // D8（C3）：同步权威 World 托管钩子（三者同发：跳过 tick + 暂停 DOWNED/救援计时 + 抓拍 PersonalState）。
  applyWorldDisconnect(room, seat.seatIndex, true);
  notifyRoomChanged(room);

  if (seat.disconnectTimer) clearTimeout(seat.disconnectTimer);
  seat.disconnectTimer = setTimeout(() => {
    if (seat.status !== "disconnected" || seat.userId !== userId) return;
    clearSeat(room, seat.seatIndex);
    if (seatedCount(room) < config.minPlayers && room.roomState === "active") {
      room.roomState = "seating";
    }
    bumpRoomVersion(room);
    notifyRoomChanged(room);
  }, config.disconnectGraceMs);
  seat.disconnectTimer.unref?.();
}

export function clearDisconnectTimer(room: Room, userId: string): void {
  const seat = room.seats.find((s) => s.userId === userId);
  if (seat?.disconnectTimer) {
    clearTimeout(seat.disconnectTimer);
    seat.disconnectTimer = null;
  }
  if (seat) seat.disconnectedAt = null;
}

export function clearSeat(room: Room, seatIndex: number): void {
  const prev = room.seats[seatIndex];
  if (prev?.disconnectTimer) {
    clearTimeout(prev.disconnectTimer);
    prev.disconnectTimer = null;
  }
  room.seats[seatIndex] = emptySeat(seatIndex);
}

export function leaveRoom(room: Room, userId: string): void {
  const seatIndex = room.seats.findIndex((s) => s.userId === userId);
  if (seatIndex === -1) throw new Error("NOT_IN_ROOM");
  clearSeat(room, seatIndex);
  if (seatedCount(room) < config.minPlayers) room.roomState = "seating";
  bumpRoomVersion(room);
  notifyRoomChanged(room);
}

export function destroyRoom(room: Room): void {
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
 * GC 空好友房（空闲 > roomIdleTtlMs）。
 * S1.5 RESIDENT：resident 房一律排除，永不被 GC（公共房保活）。
 * @returns destroyed roomIds
 */
export function sweepIdleEmptyRooms(now = Date.now()): string[] {
  const swept: string[] = [];
  for (const room of [...rooms.values()]) {
    if (room.resident) continue; // C4：RESIDENT 排除
    if (room.roomState === "active") continue;
    if (seatedCount(room) > 0) continue;
    if (room.seats.some((s) => s.status === "disconnected")) continue;
    if (now - room.lastActivityAt < config.roomIdleTtlMs) continue;
    destroyRoom(room);
    swept.push(room.roomId);
  }
  return swept;
}

export function roomSnapshot(room: Room) {
  return {
    type: "room.snapshot",
    protocolVersion: config.protocolVersion,
    roomId: room.roomId,
    roomCode: room.roomCode,
    inviteToken: room.inviteToken,
    resident: room.resident,
    stateVersion: room.roomVersion,
    roomState: room.roomState,
    ownerId: room.ownerId,
    actingOwnerId: room.actingOwnerId ?? null,
    runId: room.runId,
    biomeId: room.biomeId,
    seats: room.seats.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      displayName: s.displayName,
      status: s.status,
      disconnected: s.status === "disconnected",
    })),
  };
}
