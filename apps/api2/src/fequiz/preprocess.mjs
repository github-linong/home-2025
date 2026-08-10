/**
 * fequiz 全量预处理：导入题库后，对每道原题生成 6 类题型变体并落库。
 *
 * 时机：导入时全量预处理（不在出卷时按需生成）。
 *
 * 特性：
 *  - 分批处理（默认每批 40 题），并发调用 LLM（默认 3 并发）
 *  - 断点续传：已生成的变体跳过（fe_questions.processed = 1），中断后可重跑
 *  - 失败重试：单题 LLM 失败自动降级为离线模板，绝不阻塞
 *
 * Usage:
 *   npm run fe:preprocess --prefix apps/api2
 *   或由 fe:import 在导入完成后自动调用。
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BASE_SCORES,
  QTYPES,
  generateLlmVariants,
  normalizeVariant,
  fallbackVariant,
  mapLimit,
  isValidType,
} from "./gen.mjs";
import { fequizConnect } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile?.(join(__dirname, "..", "..", ".env"));
} catch {
  /* env already provided */
}

const BATCH_SIZE = Number(process.env.FE_PRE_BATCH || 40);
const CONCURRENCY = Number(process.env.FE_PRE_CONCURRENCY || 3);
const TYPES = QTYPES.map((q) => q.type);

/**
 * 处理所有 processed = 0 的题目，生成 6 类题型。
 * @param {import("mysql2/promise").Connection} conn
 * @returns {Promise<{processed:number, variants:number, llm:number, fallback:number, batchCount:number}>}
 */
export async function preprocessAll(conn, { types = TYPES, onProgress } = {}) {
  const want = types.filter(isValidType);
  if (!want.length) throw new Error("no valid types to preprocess");

  let processed = 0;
  let variants = 0;
  let llm = 0;
  let fallback = 0;
  let batchCount = 0;

  // 分页读取未处理题目（processed=0），逐批生成。
  // 由于 processed 在批内更新，用 LIMIT/OFFSET 可能跳题；改用「游标 + 实时标记」。
  const batchLimit = Math.max(1, Math.floor(Number(BATCH_SIZE)));
  while (true) {
    // LIMIT 用整数插值（mysql2 预编译对 LIMIT 占位符支持不稳定）。
    const [rows] = await conn.query(
      `SELECT id, title, body, category_id
       FROM fe_questions
       WHERE processed = 0
       ORDER BY id ASC
       LIMIT ${batchLimit}`,
    );
    if (!rows.length) break;
    batchCount += 1;

    const need = rows.filter((q) => {
      // 该题可能已有部分题型，只需补缺。
      return true; // 由 ensureMissing 内部处理
    });

    await mapLimit(need, CONCURRENCY, async (q) => {
      const have = await existingTypes(conn, q.id);
      const missing = want.filter((t) => !have.includes(t));
      if (!missing.length) {
        await markProcessed(conn, q.id);
        processed += 1;
        return;
      }

      let llmSet = null;
      try {
        llmSet = await generateLlmVariants(q, missing);
      } catch (err) {
        console.error(`[fequiz:pre] LLM gen failed for #${q.id}:`, err?.message || err);
      }

      for (const qtype of missing) {
        const payload =
          normalizeVariant(qtype, llmSet?.[qtype]) || fallbackVariant(q, qtype);
        if (!payload) continue;
        const model = llmSet?.[qtype] ? "llm" : "fallback";
        const base = BASE_SCORES[qtype] || 5;
        await conn.execute(
          `INSERT IGNORE INTO fe_variants (question_id, qtype, payload, base_score, model)
           VALUES (?, ?, ?, ?, ?)`,
          [q.id, qtype, JSON.stringify(payload), base, model],
        );
        variants += 1;
        if (model === "llm") llm += 1;
        else fallback += 1;
      }
      await markProcessed(conn, q.id);
      processed += 1;
    });

    const meta = { batch: batchCount, processed, variants, llm, fallback };
    onProgress?.(meta);
    console.log(
      `[fequiz:pre] batch ${batchCount}: processed=${processed} variants=${variants} (llm ${llm} / fallback ${fallback})`,
    );

    // 防御：若一轮没有任何题目被处理，退出防止死循环。
    if (rows.length < BATCH_SIZE) break;
  }

  return { processed, variants, llm, fallback, batchCount };
}

async function existingTypes(conn, questionId) {
  const [rows] = await conn.execute(
    `SELECT qtype FROM fe_variants WHERE question_id = ?`,
    [questionId],
  );
  return rows.map((r) => r.qtype);
}

async function markProcessed(conn, questionId) {
  await conn.execute(`UPDATE fe_questions SET processed = 1 WHERE id = ?`, [questionId]);
}

// ── CLI ──────────────────────────────────────────────────────────────────
async function main() {
  const conn = await fequizConnect();
  try {
    const result = await preprocessAll(conn);
    console.log("[fequiz:pre] DONE", JSON.stringify(result));
  } finally {
    await conn.end();
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[fequiz:pre] failed:", err);
    process.exitCode = 1;
  });
}
