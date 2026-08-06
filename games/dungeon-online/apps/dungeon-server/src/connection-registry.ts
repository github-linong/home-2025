/**
 * connection-registry.ts — 连接登记 / 广播（E1.S1.2 / C5 双平面）
 *
 * 复用参照（镜像 poker connection-registry.js，不跨仓 import）：
 *   apps/poker-realtime/src/ws/connection-registry.js
 *   - connectionsById / activeUserConn、registerConnection（重复连接踢旧）、
 *     removeConnection、setRoom、broadcastToRoom、sendToUser、sendToConn、kickUser。
 *
 * dungeon 差异（C5 双平面）：
 *   - 连接抽象为 Conn.send(payload, { binary })：payload 已是「序列化后的字符串/Buffer」
 *     （由本模块 serialize 完成），Conn 只负责传输，避免双重 JSON 编码。
 *   - 数据面默认仍是 JSON→Buffer 的「占位二进制」；真正的 state-diff 二进制
 *     delta 实现推迟（R1，见 gateway.ts TODO）。
 *   - Conn 可注入（测试用 fake send），无需真实 ws 即可单测广播/踢人逻辑。
 */

export type SendPlane = "control" | "data";

export interface SendOptions {
  /** 数据面走二进制 Buffer（R1 前为 JSON 序列化后的 Buffer 占位）。 */
  readonly binary?: boolean;
}

/** Conn.send 接收「已序列化」的 string | Buffer（本模块负责 serialize）。 */
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

function serialize(msg: unknown, opts: SendOptions): string | Uint8Array {
  if (opts.binary) return Buffer.from(JSON.stringify(msg)); // R1 TODO: 替换为紧凑二进制 diff
  return JSON.stringify(msg);
}

export function registerConnection(conn: Conn): string {
  const connId = `conn_${++connCounter}`;
  const existingConnId = activeUserConn.get(conn.userId);
  if (existingConnId) {
    const existing = connectionsById.get(existingConnId);
    if (existing) {
      existing.send(
        serialize(
          { type: "session.kicked", userId: conn.userId, reason: "duplicate_connection" },
          { binary: false },
        ),
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

export function broadcastToRoom(
  roomId: string,
  message: unknown,
  opts: { exceptUserId?: string | null; binary?: boolean } = {},
): void {
  const payload = serialize(message, { binary: opts.binary });
  for (const conn of connectionsById.values()) {
    if (conn.roomId !== roomId) continue;
    if (opts.exceptUserId && conn.userId === opts.exceptUserId) continue;
    conn.send(payload, { binary: opts.binary });
  }
}

export function sendToUser(
  userId: string,
  message: unknown,
  opts: SendOptions = {},
): void {
  const connId = activeUserConn.get(userId);
  if (!connId) return;
  const conn = connectionsById.get(connId);
  if (conn) conn.send(serialize(message, opts), opts);
}

export function sendToConn(
  connId: string,
  message: unknown,
  opts: SendOptions = {},
): void {
  const conn = connectionsById.get(connId);
  if (conn) conn.send(serialize(message, opts), opts);
}

export function kickUser(userId: string, reason = "kicked"): boolean {
  const connId = activeUserConn.get(userId);
  if (!connId) return false;
  const conn = connectionsById.get(connId);
  const roomId = conn?.roomId ?? null;
  const payload = serialize({ type: "session.kicked", userId, reason }, { binary: false });
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
