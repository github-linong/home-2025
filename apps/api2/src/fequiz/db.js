/**
 * fequiz MySQL 连接模块（使用服务器 MySQL / 本地 brew MySQL）。
 * 环境变量：
 *   FEQUIZ_MYSQL_HOST    默认 127.0.0.1
 *   FEQUIZ_MYSQL_PORT    默认 3306
 *   FEQUIZ_MYSQL_USER    默认 fequiz
 *   FEQUIZ_MYSQL_PASSWORD 默认 fequiz_dev
 *   FEQUIZ_MYSQL_DATABASE 默认 fequiz
 *   FEQUIZ_MYSQL_URL     若设置则优先（mysql://user:pass@host:port/db）
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  // Works whether launched with --env-file or not.
  process.loadEnvFile?.(join(__dirname, "..", "..", ".env"));
} catch {
  /* env already provided */
}

export function fequizConfig() {
  if (process.env.FEQUIZ_MYSQL_URL) {
    return { uri: process.env.FEQUIZ_MYSQL_URL };
  }
  return {
    host: process.env.FEQUIZ_MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.FEQUIZ_MYSQL_PORT || 3306),
    user: process.env.FEQUIZ_MYSQL_USER || "fequiz",
    password: process.env.FEQUIZ_MYSQL_PASSWORD || "fequiz_dev",
    database: process.env.FEQUIZ_MYSQL_DATABASE || "fequiz",
  };
}

/** 新建一个连接（脚本用，单条连接便于事务）。 */
export async function fequizConnect() {
  const cfg = fequizConfig();
  return cfg.uri
    ? await mysql.createConnection(cfg.uri)
    : await mysql.createConnection(cfg);
}

/** 连接池（路由/服务用）。 */
export function fequizPool() {
  const cfg = fequizConfig();
  const opts = cfg.uri ? { uri: cfg.uri } : cfg;
  return mysql.createPool({ ...opts, waitForConnections: true, connectionLimit: 5, namedPlaceholders: true });
}
