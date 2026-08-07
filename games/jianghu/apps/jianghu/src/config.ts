/**
 * config.ts — jianghu-server 运行时配置（E1.S1.4 / C2）
 * ===========================================================================
 * 复用参照（镜像 dungeon-online apps/dungeon-server/src/config.ts，不跨仓 import，自包含）：
 *   - 端口 / API2 鉴权基址 / 断线宽限 / 重连 token TTL / GC 窗口等字段语义对齐。
 *
 * 关键覆盖（C2）：pongTimeoutMs=5000 / pingIntervalMs=1000。
 *   wander/chat 默认 45s/15s 适用于回合制 / 聊天，实时战斗下会误判玩家掉线，必须显式覆盖。
 *   其余各 infra 默认（45s/15s）一律不允许裸用 —— 此处是唯一心跳配置出处。
 *
 * 注意：tick 相关常量（TICK_RATE 等）**不在此定义**，统一来自 sim-core/constants.ts（C1/C7）。
 */

function num(envKey: string, fallback: number): number {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  /** HTTP/WS 监听端口。 */
  port: num("PORT", 3011),

  /** API2 鉴权基址（verifyWithApi2 + HTTP 登录代理）。E14：优先 JIANGHU_API2_URL，
   *  兼容旧 API2_BASE_URL（chat 等兄弟服务沿用），默认 http://127.0.0.1:3002。 */
  api2BaseUrl:
    process.env.JIANGHU_API2_URL ??
    process.env.API2_BASE_URL ??
    "http://127.0.0.1:3002",

  /** API2 Better Auth 信任的 Origin（HTTP 登录代理转发时携带，过 CSRF 校验）。
   *  E14：Node fetch 自动带 sec-fetch-mode:cors → api2 强制 Origin 校验；值必须在
   *  api2 的 BETTER_AUTH_TRUSTED_ORIGINS 内。默认匹配本地 dev api2（4321 端口）的
   *  trustedOrigins；生产部署须设 JIANGHU_API2_ORIGIN=https://lilnong.top。 */
  api2Origin: process.env.JIANGHU_API2_ORIGIN ?? "http://localhost:4321",

  /** 开发态跳过真实鉴权（用 devUserId 注入身份）。E1 默认开启以便离线起服务。 */
  devSkipAuth: process.env.DEV_SKIP_AUTH !== "false",

  // ---- 联机房间 ----
  /** 主世界 RESIDENT 单默认房间稳定 ID（多实例 sticky 路由键，见 ADR-JH-NET-01 §4）。 */
  residentRoomId: "room_resident_public",
  /** 副本 instance 空闲销毁窗口（无成员且超过此窗口则销毁；RESIDENT 永不被 GC）。 */
  instanceIdleTtlMs: num("INSTANCE_IDLE_TTL_MS", 30 * 60 * 1000),
  /** 重连 token 有效期。 */
  reconnectTokenTtlMs: num("RECONNECT_TOKEN_TTL_MS", 1_800_000),
  /** 断线宽限：宽限内可重连，超时清成员（chat 模型复用）。 */
  disconnectGraceMs: num("DISCONNECT_GRACE_MS", 30_000),

  // ---- C2 心跳覆盖（关键，实时战斗）----
  /** 玩家 5s 无 pong 即判掉线（覆盖 wander/chat 45s）。 */
  pongTimeoutMs: num("PONG_TIMEOUT_MS", 5000),
  /** 每 1s 发一次 ping（覆盖 wander/chat 15s）。 */
  pingIntervalMs: num("PING_INTERVAL_MS", 1000),

  /** 单帧最大消息体积（控制面 JSON）。 */
  maxMessageBytes: num("MAX_MESSAGE_BYTES", 8_192),

  /** 协议版本（控制面消息携带，便于客户端/服务器版本协商）。 */
  protocolVersion: 1,

  /** 内部 admin 令牌（/internal/kick）。 */
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN ?? "dev-admin-token",

  // ---- 持久化（E2 · ADR-JH-ENG-02）----
  /** 角色 autosave 间隔（ms）。架构 §7：定时 30s + 关键事件（创建/加入/下线）落库。 */
  characterAutosaveMs: num("CHARACTER_AUTOSAVE_MS", 30_000),
  /** JSON 文件存储目录（非空 → 启用 JsonFileCharacterStore）；空 → 内存存储（默认，真实 DB 留 TODO）。 */
  jsonStoreDir: process.env.JIANGHU_JSON_STORE_DIR ?? "",
} as const;

export type ServerConfig = typeof config;
