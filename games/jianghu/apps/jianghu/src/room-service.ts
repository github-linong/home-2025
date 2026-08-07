/**
 * room-service.ts — 联机房间 / 重连 / RESIDENT（E1.S1.1 / S1.5 / C5 / C-Net-3）
 * ===========================================================================
 * 复用参照（镜像 dungeon-online room-service + chat 广播域模型，不跨仓 import）：
 *   - RESIDENT 公共房：进程级单例 + sweep 排除 + 多实例 sticky 路由（ADR-JH-NET-01 §4）。
 *   - 重连 token / validateReconnect / markDisconnected：chat 模型复用（C-Net-3）。
 *
 * jianghu 差异（E1 占位）：
 *   - 主世界 = 单默认 RESIDENT 房间（任意加入，无房间码）；副本 = 每副本一个独立 instance 房间
 *     （成员锁定，C-Dgn-2），独立广播域（C-Net-1 双向零泄漏由连接登记的 roomId 路由保证）。
 *   - 真实副本生成（seed/成员锁定/Boss 置深）在 E3 落地；本文件仅管理房间记录 + 成员 + 重连。
 */

import { config } from "./config.ts";
import { generateReconnectToken, generateId } from "./ids.ts";

export type MemberStatus = "occupied" | "disconnected";
export type RoomState = "resident" | "active" | "archived";

export interface Member {
  userId: string;
  status: MemberStatus;
  reconnectToken: string;
  reconnectTokenExpires: number;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  disconnectedAt: number | null;
}

export interface Room {
  readonly roomId: string;
  readonly resident: boolean;
  /** 副本 instance：成员锁定后不可变（C-Dgn-2）。 */
  locked: boolean;
  roomState: RoomState;
  members: Map<string, Member>;
  readonly createdAt: number;
  lastActivityAt: number;
}

const rooms = new Map<string, Room>();

/** RESIDENT 单例稳定 ID（多实例 sticky 路由键，见 ADR-JH-NET-01 §4）。 */
export const RESIDENT_ROOM_ID = config.residentRoomId;

let roomChangeListener: ((room: Room) => void) | null = null;
export function setRoomChangeListener(fn: (room: Room) => void): void {
  roomChangeListener = fn;
}
function notifyRoomChanged(room: Room): void {
  roomChangeListener?.(room);
}

function emptyMember(userId: string): Member {
  return {
    userId,
    status: "occupied",
    reconnectToken: generateReconnectToken(),
    reconnectTokenExpires: Date.now() + config.reconnectTokenTtlMs,
    disconnectTimer: null,
    disconnectedAt: null,
  };
}

/** S1.5 RESIDENT：进程级单例公共房。启动时调用一次；多实例下所有实例用同一 ID 路由（sticky 由前置 LB 负责）。 */
export function ensureResidentRoom(): Room {
  const existing = rooms.get(RESIDENT_ROOM_ID);
  if (existing && existing.roomState !== "archived") return existing;
  const room: Room = {
    roomId: RESIDENT_ROOM_ID,
    resident: true,
    locked: false,
    roomState: "resident",
    members: new Map(),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  rooms.set(RESIDENT_ROOM_ID, room);
  return room;
}

/**
 * 创建副本 instance 房间（E1 占位 → E5 成员锁定，C-Dgn-2）。
 * 创建即锁定全部传入成员（members[] 不可变，C-Dgn-2）；后续 joinInstance 对锁定房拒绝。
 * @param members 进入瞬间锁定的 userId 列表（不可变）。
 */
export function createInstanceRoom(members: readonly string[]): Room {
  const roomId = generateId("inst");
  const memberMap = new Map<string, Member>();
  for (const userId of members) memberMap.set(userId, emptyMember(userId));
  const room: Room = {
    roomId,
    resident: false,
    locked: true,
    roomState: "active",
    members: memberMap,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  rooms.set(roomId, room);
  return room;
}

/** 取副本 instance 房间（RESIDENT / 不存在返回 null）。 */
export function getInstanceRoom(roomId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room || room.resident) return null;
  return room;
}

/** userId 是否为某房间成员（含 RESIDENT；不存在返回 false）。 */
export function isMember(roomId: string, userId: string): boolean {
  return rooms.get(roomId)?.members.has(userId) ?? false;
}

/** 副本 instance 锁定成员 userId 列表（C-Dgn-2：不可变视图）。 */
export function getInstanceMembers(roomId: string): readonly string[] {
  const room = getInstanceRoom(roomId);
  if (!room) return [];
  return [...room.members.keys()];
}

export function getRoom(roomId: string): Room | null {
  return rooms.get(roomId) ?? null;
}

export function getResidentRoom(): Room {
  return ensureResidentRoom();
}

/** 玩家当前所在房间（按成员归属查找）。 */
export function getRoomByMember(userId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.members.has(userId)) return room;
  }
  return null;
}

export function bumpRoomActivity(room: Room): void {
  room.lastActivityAt = Date.now();
}

/** 加入 RESIDENT 主世界（任意加入，不锁定）。 */
export function joinResident(userId: string): Room {
  const room = ensureResidentRoom();
  if (!room.members.has(userId)) room.members.set(userId, emptyMember(userId));
  bumpRoomActivity(room);
  notifyRoomChanged(room);
  return room;
}

/** 加入副本 instance（C-Dgn-2：锁定房拒绝第 2 人）。 */
export function joinInstance(roomId: string, userId: string): { ok: boolean; reason?: string } {
  const room = rooms.get(roomId);
  if (!room || room.resident) return { ok: false, reason: "NOT_INSTANCE" };
  if (room.locked) return { ok: false, reason: "INSTANCE_LOCKED" };
  if (!room.members.has(userId)) room.members.set(userId, emptyMember(userId));
  bumpRoomActivity(room);
  notifyRoomChanged(room);
  return { ok: true };
}

export function validateReconnect(
  roomId: string,
  userId: string,
  reconnectToken: string,
): { reconnectToken: string } {
  const room = rooms.get(roomId);
  if (!room) throw new Error("ROOM_NOT_FOUND");
  const m = room.members.get(userId);
  if (!m) throw new Error("MEMBER_NOT_FOUND");
  if (!m.reconnectToken || m.reconnectToken !== reconnectToken) {
    throw new Error("RECONNECT_EXPIRED");
  }
  if (m.reconnectTokenExpires && m.reconnectTokenExpires < Date.now()) {
    throw new Error("RECONNECT_EXPIRED");
  }
  m.status = "occupied";
  m.reconnectToken = generateReconnectToken();
  m.reconnectTokenExpires = Date.now() + config.reconnectTokenTtlMs;
  if (m.disconnectTimer) {
    clearTimeout(m.disconnectTimer);
    m.disconnectTimer = null;
  }
  m.disconnectedAt = null;
  bumpRoomActivity(room);
  notifyRoomChanged(room);
  return { reconnectToken: m.reconnectToken };
}

export function markDisconnected(roomId: string, userId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const m = room.members.get(userId);
  if (!m || m.status !== "occupied") return;
  m.status = "disconnected";
  m.disconnectedAt = Date.now();
  bumpRoomActivity(room);
  notifyRoomChanged(room);

  if (m.disconnectTimer) clearTimeout(m.disconnectTimer);
  m.disconnectTimer = setTimeout(() => {
    if (m.status !== "disconnected" || m.userId !== userId) return;
    room.members.delete(userId);
    if (room.resident) ensureResidentRoom(); // RESIDENT 永不销毁
    bumpRoomActivity(room);
    notifyRoomChanged(room);
  }, config.disconnectGraceMs);
  m.disconnectTimer.unref?.();
}

export function leaveRoom(roomId: string, userId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const m = room.members.get(userId);
  if (m?.disconnectTimer) {
    clearTimeout(m.disconnectTimer);
    m.disconnectTimer = null;
  }
  room.members.delete(userId);
  bumpRoomActivity(room);
  notifyRoomChanged(room);
}

/**
 * last-wins 顶替（C-Per-4）：同账号后连接原子接管旧会话的 member 状态机。
 *
 * 说明：连接级「断旧连接」已由 connection-registry.registerConnection 在**新连接注册时**
 * 同步踢掉旧 conn（下发 session.kicked）完成。本函数负责 member 状态机的**原子接管**：
 * 若同 userId 的旧 member 因旧连接断开而处于 `disconnected`，则在同一同步调用内 reclaim
 * 为 `occupied`（单一 member 条目，绝不出现两条 occupied）。全程同步，无双会话并存窗口。
 *
 * 由 gateway 在 room.join 成功（已知 roomId）后对**登录玩家**调用；游客 userId 唯一
 * （随机 guestId），永不触发，无需顶替。
 */
export function enforceLastWins(roomId: string, userId: string): { reclaimed: boolean } {
  const room = getRoom(roomId);
  if (!room) return { reclaimed: false };

  const m = room.members.get(userId);
  if (!m) {
    // 首次加入：建 occupied member（与 joinResident 互补，确保登录即占用）。
    room.members.set(userId, emptyMember(userId));
    bumpRoomActivity(room);
    notifyRoomChanged(room);
    return { reclaimed: true };
  }
  if (m.status !== "occupied") {
    // 旧会话断开遗留的 disconnected member → 原子 reclaim 为 occupied（接管）。
    m.status = "occupied";
    m.disconnectedAt = null;
    if (m.disconnectTimer) {
      clearTimeout(m.disconnectTimer);
      m.disconnectTimer = null;
    }
    bumpRoomActivity(room);
    notifyRoomChanged(room);
    return { reclaimed: true };
  }
  // 已是 occupied（正常首连 / 无顶替需求）：无需动作。
  return { reclaimed: false };
}

export function destroyRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const m of room.members.values()) {
    if (m.disconnectTimer) {
      clearTimeout(m.disconnectTimer);
      m.disconnectTimer = null;
    }
  }
  room.roomState = "archived";
  rooms.delete(roomId);
}

/**
 * GC 空副本 instance 房间（空闲 > instanceIdleTtlMs）。
 * RESIDENT 房一律排除，永不被 GC（公共房保活，C5）。
 * @returns destroyed roomIds
 */
export function sweepIdleEmptyRooms(now = Date.now()): string[] {
  const swept: string[] = [];
  for (const room of [...rooms.values()]) {
    if (room.resident) continue; // C5：RESIDENT 排除
    if (room.roomState === "archived") continue;
    if (room.members.size > 0) continue;
    if (now - room.lastActivityAt < config.instanceIdleTtlMs) continue;
    destroyRoom(room.roomId);
    swept.push(room.roomId);
  }
  return swept;
}

/** 控制面房间快照（显式 type，禁止形状猜测路由，C4）。 */
export function roomSnapshot(room: Room) {
  return {
    type: "room.snapshot",
    protocolVersion: config.protocolVersion,
    roomId: room.roomId,
    resident: room.resident,
    roomState: room.roomState,
    locked: room.locked,
    members: [...room.members.values()].map((m) => ({
      userId: m.userId,
      status: m.status,
      disconnected: m.status === "disconnected",
    })),
  };
}
