import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3003),
  api2BaseUrl: process.env.API2_BASE_URL ?? "http://127.0.0.1:3002",
  journalDir: process.env.JOURNAL_DIR ?? "./data/poker-journal",
  sessionCacheTtlMs: Number(process.env.SESSION_CACHE_TTL_MS ?? 300_000),
  sessionRecheckEveryActions: Number(process.env.SESSION_RECHECK_EVERY_ACTIONS ?? 5),
  actionTimeoutMs: Number(process.env.ACTION_TIMEOUT_MS ?? 30_000),
  disconnectGraceMs: Number(process.env.DISCONNECT_GRACE_MS ?? 30_000),
  reconnectActionTimeoutMs: Number(process.env.RECONNECT_ACTION_TIMEOUT_MS ?? 15_000),
  tableStartStack: Number(process.env.TABLE_START_STACK ?? 500),
  sb: Number(process.env.SB ?? 5),
  bb: Number(process.env.BB ?? 10),
  seatLockTtlMs: Number(process.env.SEAT_LOCK_TTL_MS ?? 10_000),
  reconnectTokenTtlMs: Number(process.env.RECONNECT_TOKEN_TTL_MS ?? 1_800_000),
  gracePeriodMs: Number(process.env.GRACE_PERIOD_MS ?? 30_000),
  finalizeGcMs: Number(process.env.FINALIZE_GC_MS ?? 300_000),
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN ?? "dev-admin-token",
  devSkipAuth: process.env.DEV_SKIP_AUTH === "true",
  maxSeats: 9,
  minPlayers: 2,
  /** Bot auto-action delay (ms). */
  botActionDelayMs: Number(process.env.BOT_ACTION_DELAY_MS ?? 500),
  /**
   * Casual practice tables: when a seated player hits 0 chips at hand end,
   * restore TABLE_START_STACK so the match can continue (no economy).
   */
  autoRebuyOnBust: process.env.AUTO_REBUY_ON_BUST !== "false",
  pingIntervalMs: 15_000,
  pongTimeoutMs: 45_000,
  maxMessageBytes: 8_192,
  protocolVersion: 1,
  roomCodeLength: 6,
  /** Empty lobby rooms with no seated players are GC'd after this idle window. */
  roomIdleTtlMs: Number(process.env.ROOM_IDLE_TTL_MS ?? 30 * 60 * 1000),
};
