/**
 * Per-channel message store.
 *
 * Two layers:
 *  - In-memory ring buffer (`channels`): the fast read path. `getHistory` /
 *    `append` / `has` stay fully synchronous so no call sites need to change.
 *  - Optional MySQL durability: when `MYSQL_*` env is configured, messages are
 *    asynchronously written to a `chat_messages` table and the ring buffer is
 *    preloaded from MySQL on boot. This makes chat history survive restarts.
 *
 * If MySQL is unavailable (no env, module missing, or connection error) the
 * store degrades to pure in-memory mode with a warning — it never crashes the
 * service. Swap the persistence backend here without touching call sites.
 */
import { config } from "./config.js";

/** @type {Map<string, any[]>} */
const channels = new Map();

export function append(channel, msg, max = config.historyPerChannel) {
  let arr = channels.get(channel);
  if (!arr) {
    arr = [];
    channels.set(channel, arr);
  }
  arr.push(msg);
  if (arr.length > max) arr.splice(0, arr.length - max);
  persist(channel, msg);
}

export function getHistory(channel, limit = 50) {
  const arr = channels.get(channel);
  if (!arr) return [];
  return arr.slice(Math.max(0, arr.length - limit));
}

export function has(channel) {
  return channels.has(channel);
}

// ── MySQL durability (optional, graceful) ──────────────────────────────────

let mysqlPool = null;
let mysqlReady = false;
let initPromise = null;

function mysqlConfig() {
  const host = process.env.MYSQL_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "site",
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE ?? "personal_site",
    connectionLimit: Number(process.env.CHAT_MYSQL_POOL ?? 4),
    charset: "utf8mb4",
    supportBigNumbers: true,
    bigNumberStrings: false,
    enableKeepAlive: true,
    waitForConnections: true,
  };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(64) NOT NULL,
  channel VARCHAR(191) NOT NULL,
  author_id VARCHAR(191),
  author_name VARCHAR(191),
  author_is_guest TINYINT(1) NOT NULL DEFAULT 0,
  author_json JSON,
  text TEXT,
  ts BIGINT NOT NULL,
  client_msg_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_channel_client (channel, client_msg_id),
  KEY idx_channel_ts (channel, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

function rowToMsg(r) {
  return {
    id: r.id,
    channel: r.channel,
    author: typeof r.author_json === "object" && r.author_json ? r.author_json : {
      userId: r.author_id,
      name: r.author_name,
      isGuest: !!r.author_is_guest,
    },
    text: r.text,
    ts: Number(r.ts),
    clientMsgId: r.client_msg_id ?? undefined,
  };
}

async function ensureSchema() {
  await mysqlPool.query(SCHEMA_SQL);
}

async function preload() {
  // Load the most recent rows across all channels, then fill the in-memory
  // ring buffer per channel (oldest-first, capped to historyPerChannel).
  const cap = Math.max(2000, config.historyPerChannel * 20);
  const [rows] = await mysqlPool.query(
    "SELECT id, channel, author_id, author_name, author_is_guest, author_json, text, ts, client_msg_id " +
    "FROM chat_messages ORDER BY ts DESC LIMIT ?",
    [cap],
  );
  /** @type {Map<string, any[]>} */
  const byChannel = new Map();
  for (const r of rows.reverse()) {
    const arr = byChannel.get(r.channel) ?? [];
    arr.push(rowToMsg(r));
    byChannel.set(r.channel, arr);
  }
  for (const [ch, arr] of byChannel) {
    channels.set(ch, arr.slice(-config.historyPerChannel));
  }
}

/**
 * Initialize the MySQL durability layer. Safe to call multiple times (the work
 * runs once). Resolves even when MySQL is unavailable — the store simply stays
 * in-memory. Must be awaited before `listen` in production so the ring buffer
 * is warm.
 */
export function init() {
  if (initPromise) return initPromise;
  const cfg = mysqlConfig();
  if (!cfg) {
    console.warn("[chat/store] MYSQL_HOST 未配置：聊天记录仅保存在内存（重启即丢失）。生产环境请配置 MYSQL_* 连接服务器 MySQL。");
    initPromise = Promise.resolve(false);
    return initPromise;
  }
  initPromise = (async () => {
    try {
      const mysql = await import("mysql2/promise");
      mysqlPool = mysql.createPool(cfg);
      await mysqlPool.query("SELECT 1");
      await ensureSchema();
      await preload();
      mysqlReady = true;
      console.log("[chat/store] MySQL 持久化已启用，历史记录已从服务器加载。");
      return true;
    } catch (err) {
      console.error(`[chat/store] MySQL 连接/初始化失败，回退到内存模式：${err?.message ?? err}`);
      mysqlPool = null;
      return false;
    }
  })();
  return initPromise;
}

/** Async fire-and-forget write. Never throws into the caller. */
function persist(channel, msg) {
  if (!mysqlReady || !mysqlPool) return;
  const author = msg.author ?? {};
  const clientMsgId = msg.clientMsgId || null;
  mysqlPool
    .query(
      `INSERT INTO chat_messages
        (id, channel, author_id, author_name, author_is_guest, author_json, text, ts, client_msg_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE text = VALUES(text), ts = VALUES(ts)`,
      [
        msg.id,
        channel,
        author.userId ?? null,
        author.name ?? null,
        author.isGuest ? 1 : 0,
        JSON.stringify(author),
        msg.text ?? "",
        msg.ts ?? Date.now(),
        clientMsgId,
      ],
    )
    .catch((err) => {
      console.error(`[chat/store] 写入 MySQL 失败（消息已保留在内存）：${err?.message ?? err}`);
    });
}

/** Close the pool (used on shutdown). */
export async function close() {
  if (mysqlPool) {
    try { await mysqlPool.end(); } catch {}
    mysqlPool = null;
  }
  mysqlReady = false;
}
