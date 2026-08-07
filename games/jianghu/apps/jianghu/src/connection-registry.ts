/**
 * connection-registry.ts — 连接登记 / 双平面广播（E1.S1.2 / C5）
 * ===========================================================================
 * 复用参照（镜像 dungeon-online connection-registry + wander/chat 广播模型，不跨仓 import）：
 *   - connectionsById / activeUserConn、registerConnection（重复连接踢旧）、
 *     removeConnection、setRoom、broadcastToRoom、sendToUser、sendToConn、kickUser。
 *
 * jianghu 双平面（C5 / C3）：
 *   - **控制面**：JSON 字符串，显式 `"type"` 字段（禁止形状猜测路由，吸收 dungeon C2）。
 *   - **数据面**：二进制 Buffer（`ws.send(Buffer)`），12Hz 状态 diff。
 *   - Conn.send 接收「已序列化」的 string | Uint8Array；本模块只负责路由，避免双重编码。
 *     binary 标志仅用于测试断言双平面落地，不影响传输。
 *
 * 连接抽象可被注入（测试用 fake send），无需真实 ws 即可单测广播/踢人逻辑。
 */

/** 发送平面：控制面 JSON / 数据面二进制。 */
export type SendPlane = "control" | "data";

export interface SendOptions {
  /** 数据面走二进制 Buffer（由 protocol-binary 预先编码）。 */
  readonly binary?: boolean;
}

/** Conn.send 接收「已序列化」的 string（控制面）| Uint8Array（数据面 Buffer）。 */
export interface Conn {
  connId: string;
  readonly userId: string;
  roomId: string | null;
  send(payload: string | Uint8Array, opts?: SendOptions): void;
  close?(code?: number, reason?: string): void;
}

export const connectionsById = new Map<string, Conn>();
export const activeUserConn = new Map<string, string>(); // userId -> connId

let connCounter = 0;

/** 控制面 JSON 序列化（仅当调用方传入对象时；Conn.send 已序列化则直接用）。 */
export function serializeControl(msg: unknown): string {
  return JSON.stringify(msg);
}

export function registerConnection(conn: Conn): string {
  const connId = `conn_${++connCounter}`;
  const existingConnId = activeUserConn.get(conn.userId);
  if (existingConnId) {
    const existing = connectionsById.get(existingConnId);
    if (existing) {
      existing.send(
        serializeControl({
          type: "session.kicked",
          userId: conn.userId,
          reason: "duplicate_connection",
        }),
        { binary: false },
      );
      existing.close?.(4002, "duplicate_connection");
      connectionsById.delete(existingConnId);
    }
  }
  conn.connId = connId;
  connectionsById.set(connId, conn);
  activeUserConn.set(conn.userId, connId);
  return connId;
}

export function removeConnection(connId: string): void {
  const conn = connectionsById.get(connId);
  if (conn) {
    if (activeUserConn.get(conn.userId) === connId) {
      activeUserConn.delete(conn.userId);
    }
    connectionsById.delete(connId);
  }
}

export function getConnection(connId: string): Conn | undefined {
  return connectionsById.get(connId);
}

export function setRoom(connId: string, roomId: string | null): void {
  const conn = connectionsById.get(connId);
  if (conn) conn.roomId = roomId;
}

/**
 * 广播到房间（payload 已是「已序列化」的 string | Uint8Array）。
 * binary 标志仅用于测试断言；传输时不二次编码。
 */
export function broadcastToRoom(
  roomId: string,
  payload: string | Uint8Array,
  opts: { exceptUserId?: string | null; binary?: boolean } = {},
): void {
  for (const conn of connectionsById.values()) {
    if (conn.roomId !== roomId) continue;
    if (opts.exceptUserId && conn.userId === opts.exceptUserId) continue;
    conn.send(payload, { binary: opts.binary });
  }
}

/** 控制面广播（JSON 对象 → 序列化后下发）。 */
export function broadcastControl(roomId: string, msg: unknown, exceptUserId?: string | null): void {
  broadcastToRoom(roomId, serializeControl(msg), { exceptUserId, binary: false });
}

/** 数据面广播（二进制 Buffer 直接下发，C3/C5）。 */
export function broadcastData(roomId: string, buf: Uint8Array, exceptUserId?: string | null): void {
  broadcastToRoom(roomId, buf, { exceptUserId, binary: true });
}

export function sendToUser(userId: string, msg: unknown, opts: SendOptions = {}): void {
  const connId = activeUserConn.get(userId);
  if (!connId) return;
  const conn = connectionsById.get(connId);
  if (conn) conn.send(opts.binary ? (msg as Uint8Array) : serializeControl(msg), opts);
}

export function sendToConn(connId: string, msg: unknown, opts: SendOptions = {}): void {
  const conn = connectionsById.get(connId);
  if (conn) conn.send(opts.binary ? (msg as Uint8Array) : serializeControl(msg), opts);
}

export function kickUser(userId: string, reason = "kicked"): boolean {
  const connId = activeUserConn.get(userId);
  if (!connId) return false;
  const conn = connectionsById.get(connId);
  const roomId = conn?.roomId ?? null;
  const payload = serializeControl({ type: "session.kicked", userId, reason });
  conn?.send(payload, { binary: false });
  conn?.close?.(4001, reason);
  if (roomId) {
    for (const c of connectionsById.values()) {
      if (c.roomId !== roomId || c.userId === userId) continue;
      c.send(payload, { binary: false });
    }
  }
  removeConnection(connId);
  return true;
}

export function getConnectionsInRoom(roomId: string): Conn[] {
  return [...connectionsById.values()].filter((c) => c.roomId === roomId);
}
