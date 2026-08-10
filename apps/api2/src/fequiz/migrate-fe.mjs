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
const seed = JSON.parse(readFileSync(join(__dirname, "seed-fe.json"), "utf8"));

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
  for (const q of seed.questions) {
    const categoryId = categoryIdBySlug.get(q.category);
    if (!categoryId) continue;
    const [res] = await conn.query(
      `INSERT INTO fe_questions (category_id, slug, title, body, difficulty, source_file, processed)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), body = VALUES(body), difficulty = VALUES(difficulty)`,
      [categoryId, q.slug, q.title, q.body, q.difficulty || "medium", `seed:${q.slug}.md`],
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
