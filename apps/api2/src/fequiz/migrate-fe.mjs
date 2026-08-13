/**
 * fequiz 迁移脚本（MySQL）：建表 + 写入内置精选种子题（保证离线可用）。
 *
 * 幂等：可重复运行（INSERT IGNORE / 幂等 upsert）。
 * Usage: npm run fe:migrate --prefix apps/api2
 *
 * 连接：见 src/fequiz/db.js（FEQUIZ_MYSQL_* 环境变量）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fequizConnect } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(join(__dirname, "schema.sql"), "utf8");
// 合并所有 seed-*.json（seed-fe 前端内置 + seed-ai AI/大模型 + seed-fde Agent落地/FDE + seed-beisen 北森改编）
const seeds = ["seed-fe.json", "seed-ai.json", "seed-fde.json", "seed-beisen.json"].map((f) =>
  JSON.parse(readFileSync(join(__dirname, f), "utf8")),
);
const seed = {
  categories: seeds.flatMap((s) => s.categories),
  questions: seeds.flatMap((s) => s.questions),
};

const conn = await fequizConnect();

try {
  // MySQL 不支持在一个 execute 里跑多语句（除非 multipleStatements），这里按分号拆分。
  const statements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await conn.query(stmt);
  }

  // 兼容旧库：为已存在的 fe_questions 补充 difficulty_level 列（MySQL 8 无 ADD COLUMN IF NOT EXISTS）。
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fe_questions' AND COLUMN_NAME = 'difficulty_level'`,
  );
  if (!cols.length) {
    await conn.query(
      `ALTER TABLE fe_questions ADD COLUMN difficulty_level TINYINT NOT NULL DEFAULT 5 COMMENT '难度 1-10' AFTER difficulty`,
    );
    console.log("[fequiz:migrate] 已为 fe_questions 补充 difficulty_level 列");
  }

  const categoryIdBySlug = new Map();
  for (const cat of seed.categories) {
    await conn.query(
      `INSERT INTO fe_categories (slug, title, description, source, sort_order)
       VALUES (?, ?, ?, 'seed', ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), description = VALUES(description),
         source = VALUES(source), sort_order = VALUES(sort_order)`,
      [cat.slug, cat.title, cat.description, cat.order ?? 0],
    );
    const [[row]] = await conn.query(`SELECT id FROM fe_categories WHERE slug = ?`, [cat.slug]);
    categoryIdBySlug.set(cat.slug, row.id);
  }

  let inserted = 0;
  const LEVEL_FROM_DIFF = { easy: 3, medium: 5, hard: 8 };
  for (const q of seed.questions) {
    const categoryId = categoryIdBySlug.get(q.category);
    if (!categoryId) continue;
    const diff = q.difficulty || "medium";
    const level = q.difficulty_level ?? LEVEL_FROM_DIFF[diff] ?? 5;
    const [res] = await conn.query(
      `INSERT INTO fe_questions (category_id, slug, title, body, difficulty, difficulty_level, source_file, processed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), body = VALUES(body),
         difficulty = VALUES(difficulty), difficulty_level = VALUES(difficulty_level)`,
      [categoryId, q.slug, q.title, q.body, diff, level, `seed:${q.slug}.md`],
    );
    inserted += res.affectedRows;
  }

  const [[counts]] = await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM fe_categories) AS categories,
      (SELECT COUNT(*) FROM fe_questions)  AS questions,
      (SELECT COUNT(*) FROM fe_variants)   AS variants
  `);
  console.log("[fequiz:migrate] OK", counts);
} catch (err) {
  console.error("[fequiz:migrate] failed:", err);
  process.exitCode = 1;
} finally {
  await conn.end();
}
