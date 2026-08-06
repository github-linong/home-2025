/**
 * core/ids.ts — ID / 房间码 / 重连 token 生成（E1.S1.1 / S1.6）
 *
 * 复用参照（镜像算法，不跨仓 import）：
 *   apps/poker-realtime/src/core/ids.js
 *   - generateRoomCode：6 位（可配）无歧义字符集（去 0/O/1/I）。
 *   - generateId / generateReconnectToken：randomBytes 十六进制。
 * 保持与 poker 完全相同的字符集与长度，便于后续跨服路由/对账。
 */

import { randomBytes } from "node:crypto";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length];
  }
  return code;
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function generateReconnectToken(): string {
  return randomBytes(32).toString("hex");
}
