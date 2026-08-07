/**
 * ids.ts — ID / 重连 token 生成（E1.S1.1 / S1.6）
 * ===========================================================================
 * 复用参照（镜像 dungeon-online apps/dungeon-server/src/core/ids.ts，不跨仓 import）：
 *   - generateId / generateReconnectToken：randomBytes 十六进制（不可猜测）。
 *   - 字符集与长度对齐兄弟项目，便于后续跨服路由/对账。
 *
 * 重连 token 复用 chat 模型（ADR-JH-NET-01 §4 / C-Net-3）：32 字节随机十六进制，
 *   服务端生成 + 校验，客户端永不预测（抗重连劫持）。
 */
import { randomBytes, randomUUID } from "node:crypto";

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function generateReconnectToken(): string {
  return randomBytes(32).toString("hex");
}

/** 游客临时会话 id（ADR-JH-ENG-02：服务端随机 UUID v4，不可猜测）。 */
export function generateGuestId(): string {
  return `guest_${randomUUID()}`;
}
