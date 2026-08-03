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
  port: Number(process.env.PORT ?? 3005),
  api2BaseUrl: process.env.API2_BASE_URL ?? "http://127.0.0.1:3002",
  sessionCacheTtlMs: Number(process.env.SESSION_CACHE_TTL_MS ?? 300_000),
  sessionRecheckEveryActions: Number(process.env.SESSION_RECHECK_EVERY_ACTIONS ?? 20),
  devSkipAuth: process.env.DEV_SKIP_AUTH === "true",
  pingIntervalMs: Number(process.env.CHAT_PING_MS ?? 20_000),
  pongTimeoutMs: Number(process.env.CHAT_PONG_MS ?? 60_000),
  maxMessageBytes: Number(process.env.CHAT_MAX_MSG_BYTES ?? 16_384),
  maxTextLength: Number(process.env.CHAT_MAX_TEXT ?? 2000),
  historyPerChannel: Number(process.env.CHAT_HISTORY ?? 200),
  rateLimit: {
    windowMs: Number(process.env.CHAT_RATE_WINDOW_MS ?? 10_000),
    maxMessages: Number(process.env.CHAT_RATE_MAX ?? 30),
    ipMaxMessages: Number(process.env.CHAT_RATE_IP_MAX ?? 150),
  },
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN ?? "dev-admin-token",
  presenceDebounceMs: Number(process.env.CHAT_PRESENCE_DEBOUNCE_MS ?? 400),
  groupMaxMembers: Number(process.env.GROUP_MAX_MEMBERS ?? 50),
  groupInviteCodeLength: Number(process.env.GROUP_INVITE_CODE_LENGTH ?? 6),
  groupMetaTtlMs: Number(process.env.GROUP_META_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),
  // Contacts system
  maxContacts: Number(process.env.MAX_CONTACTS ?? 100),
  contactAutoPruneDays: Number(process.env.CONTACT_AUTO_PRUNE_DAYS ?? 30),
};
