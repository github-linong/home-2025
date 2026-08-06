/**
 * config.ts — dungeon-server 运行时配置（E1.S1.4 / C2）
 *
 * 复用参照（镜像，不跨仓 import，保持 dungeon-server 自包含）：
 *   apps/poker-realtime/src/config.js
 *   - 房间码长度 / 座位 / 重连 token TTL / 断线宽限 / GC 窗口等字段语义对齐。
 *
 * 关键覆盖（C2）：pongTimeoutMs=5000 / pingIntervalMs=1000。
 *   poker 默认 45s/15s 适用于回合制，实时战斗下会误判玩家掉线，必须显式覆盖。
 */

function num(envKey: string, fallback: number): number {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  /** HTTP/WS 监听端口。 */
  port: num("PORT", 3010),

  /** API2 鉴权基址（verifyWithApi2）。 */
  api2BaseUrl: process.env.API2_BASE_URL ?? "http://127.0.0.1:3002",

  /** 开发态跳过真实鉴权（用 devUserId 注入身份）。 */
  devSkipAuth: process.env.DEV_SKIP_AUTH === "true",

  // ---- 联机房间（对齐 poker config.js 语义；字段命名沿用） ----
  maxSeats: num("MAX_SEATS", 4), // 2–4 人协作（允许 1 人 solo 试玩）
  minPlayers: num("MIN_PLAYERS", 1),
  roomCodeLength: num("ROOM_CODE_LENGTH", 6), // 6 位好友房码（S1.1）

  /** 断线宽限：宽限内可重连，超时清座（对齐 poker disconnectGraceMs）。 */
  disconnectGraceMs: num("DISCONNECT_GRACE_MS", 30_000),

  /** 重连 token 有效期（对齐 poker reconnectTokenTtlMs）。 */
  reconnectTokenTtlMs: num("RECONNECT_TOKEN_TTL_MS", 1_800_000),

  /** 空房 GC 空闲窗口（对齐 poker roomIdleTtlMs；RESIDENT 房在 sweep 中排除，见 S1.5）。 */
  roomIdleTtlMs: num("ROOM_IDLE_TTL_MS", 30 * 60 * 1000),

  // ---- C2 心跳覆盖（关键） ----
  /** 玩家 30s 无 pong 即判掉线（覆盖 poker 45s）。 */
  pongTimeoutMs: num("PONG_TIMEOUT_MS", 5000),
  /** 每 1s 发一次 ping（覆盖 poker 15s）。 */
  pingIntervalMs: num("PING_INTERVAL_MS", 1000),

  /** 单帧最大消息体积（控制面 JSON）。 */
  maxMessageBytes: num("MAX_MESSAGE_BYTES", 8_192),

  /** 协议版本（控制面消息携带，便于客户端/服务器版本协商）。 */
  protocolVersion: 1,

  /** 内部 admin 令牌（/internal/kick）。 */
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN ?? "dev-admin-token",
} as const;

export type ServerConfig = typeof config;
