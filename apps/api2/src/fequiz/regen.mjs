/**
 * fequiz 重生成脚本：把 model='fallback' 的题型变体重新用 LLM 生成并替换。
 *
 * 用途：LLM 生成质量提升 / 网络恢复后，把早期降级的离线模板题升级为 AI 题。
 * - 按题分组，客观/主观分批调用 LLM
 * - LLM 成功 → 替换为 llm 变体；失败 → 用改进后的 fallback 模板更新（保底）
 * - 断点续传：只处理 model='fallback' 的行，重复运行安全
 *
 * Usage: npm run fe:regen --prefix apps/api2
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fallbackVariant, generateLlmVariants, mapLimit, normalizeVariant } from "./gen.mjs";
import { fequizConnect } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile?.(join(__dirname, "..", "..", ".env"));
} catch {
  /* env already provided */
}

const CONCURRENCY = Number(process.env.FE_REGEN_CONCURRENCY || 3);

async function regenAll(conn, { onProgress } = {}) {
  const [rows] = await conn.query(
    `SELECT v.id AS variant_id, v.question_id, v.qtype, q.title, q.body
     FROM fe_variants v
     JOIN fe_questions q ON q.id = v.question_id
     WHERE v.model = 'fallback'`,
  );
  const byQuestion = new Map();
  for (const r of rows) {
    if (!byQuestion.has(r.question_id)) {
      byQuestion.set(r.question_id, { title: r.title, body: r.body, variants: [] });
    }
    byQuestion.get(r.question_id).variants.push(r);
  }

  let llm = 0;
  let fallback = 0;
  await mapLimit([...byQuestion.values()], CONCURRENCY, async ({ title, body, variants }) => {
    const qtypes = variants.map((v) => v.qtype);
    let gen = null;
    try {
      gen = await generateLlmVariants({ title, body }, qtypes);
    } catch (err) {
      console.error(`[fequiz:regen] LLM 失败 q#${variants[0].question_id}:`, err?.message || err);
    }
    for (const v of variants) {
      const payload = normalizeVariant(v.qtype, gen?.[v.qtype]) || fallbackVariant({ title, body }, v.qtype);
      const model = gen?.[v.qtype] ? "llm" : "fallback";
      await conn.query(`UPDATE fe_variants SET payload = ?, model = ? WHERE id = ?`, [
        JSON.stringify(payload),
        model,
        v.variant_id,
      ]);
      if (model === "llm") llm += 1;
      else fallback += 1;
    }
  });

  const meta = { total: rows.length, llm, fallback };
  onProgress?.(meta);
  console.log(`[fequiz:regen] 完成 total=${meta.total} llm=${llm} fallback=${fallback}`);
  return meta;
}

async function main() {
  const conn = await fequizConnect();
  try {
    await regenAll(conn);
  } finally {
    await conn.end();
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[fequiz:regen] failed:", err);
    process.exitCode = 1;
  });
}
