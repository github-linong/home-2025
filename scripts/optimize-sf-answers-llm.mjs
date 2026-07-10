#!/usr/bin/env node
/**
 * Use an LLM to optimize SegmentFault Q&A sidecars one by one.
 *
 * Prerequisites:
 *   LLM_API_KEY or OPENAI_API_KEY
 *   Optional: LLM_BASE_URL (default OpenAI), LLM_MODEL (default gpt-4o-mini)
 *
 * Usage:
 *   node scripts/optimize-sf-answers-llm.mjs              # pending only
 *   node scripts/optimize-sf-answers-llm.mjs --limit 5    # first 5 pending
 *   node scripts/optimize-sf-answers-llm.mjs --force      # re-run all
 *   node scripts/optimize-sf-answers-llm.mjs --id 1020000040138625
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatJson } from "./lib/llm-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const QA_DATA_DIR = path.join(ROOT, "apps/web/src/data/sf-answers");
const BLOG_DIR = path.join(ROOT, "apps/web/src/content/blog");
const DELAY_MS = Number(process.env.LLM_DELAY_MS || 1500);

const SYSTEM_PROMPT = `你是技术博客编辑，负责把 SegmentFault 问答整理成更易读的归档版本。

要求：
1. 保留原意与技术结论，不捏造未出现的信息
2. 若原始问题只有标题、没有正文，可基于标题合理补全「问题概述」，但不要编造具体代码或环境细节
3. 回答中的代码必须保留，仅做格式化（Markdown 代码块）
4. 输出简体中文 Markdown
5. 只返回 JSON，格式：
{
  "questionOptimized": "markdown string",
  "answerOptimized": "markdown string"
}

questionOptimized 建议结构：
### 问题概述
### 涉及技术（如有）
### 期望结果

answerOptimized 建议结构：
### 解答思路
### 示例代码（如有代码）
### 详细说明
### 小结`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

function listSidecars() {
  return fs
    .readdirSync(QA_DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(QA_DATA_DIR, f));
}

function needsOptimize(record, force) {
  if (force) return true;
  if (!record.questionOptimized?.trim() || !record.answerOptimized?.trim()) return true;
  return record.optimizedBy !== "llm" && record.optimizedBy !== "cursor";
}

async function optimizeOne(record) {
  const userPrompt = `请优化以下 SegmentFault 问答。

【原始问题】
${record.questionOriginal || "(无)"}

【原始回答】
${record.answerOriginal || "(无)"}`;

  const result = await chatJson({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  if (!result.questionOptimized?.trim() || !result.answerOptimized?.trim()) {
    throw new Error("LLM JSON missing questionOptimized or answerOptimized");
  }

  return {
    questionOptimized: result.questionOptimized.trim(),
    answerOptimized: result.answerOptimized.trim(),
    optimizedBy: "llm",
    optimizedAt: new Date().toISOString(),
    llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
  };
}

function syncMarkdownBody(record) {
  const mdPath = path.join(BLOG_DIR, `sf-a-${record.answerId}.md`);
  if (!fs.existsSync(mdPath)) return;

  const raw = fs.readFileSync(mdPath, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return;

  const fm = m[1];
  const desc = record.answerOptimized.replace(/\s+/g, " ").slice(0, 160).replace(/"/g, '\\"');
  let newFm = fm.replace(/description: ".*?"/, `description: "${desc}"`);
  if (!/description: "/.test(newFm)) {
    newFm += `\ndescription: "${desc}"`;
  }

  fs.writeFileSync(mdPath, `---\n${newFm}\n---\n\n${record.answerOptimized}\n`, "utf8");
}

async function main() {
  loadDotEnv();

  const force = process.argv.includes("--force");
  const limitArg = process.argv.find((a, i) => process.argv[i - 1] === "--limit");
  const idArg = process.argv.find((a, i) => process.argv[i - 1] === "--id");
  const limit = limitArg ? Number(limitArg) : Infinity;

  const files = listSidecars()
    .map((file) => ({ file, record: JSON.parse(fs.readFileSync(file, "utf8")) }))
    .filter(({ record }) => !idArg || record.answerId === idArg)
    .filter(({ record }) => needsOptimize(record, force));

  if (files.length === 0) {
    console.log("Nothing to optimize.");
    return;
  }

  const batch = files.slice(0, limit);
  console.log(`Optimizing ${batch.length} / ${files.length} pending with LLM...`);

  let ok = 0;
  let fail = 0;

  for (const { file, record } of batch) {
    process.stdout.write(`[${ok + fail + 1}/${batch.length}] ${record.answerId} … `);
    try {
      const optimized = await optimizeOne(record);
      const updated = { ...record, ...optimized };
      fs.writeFileSync(file, JSON.stringify(updated, null, 2), "utf8");
      syncMarkdownBody(updated);
      console.log("✓");
      ok++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      fail++;
    }
    if (ok + fail < batch.length) await sleep(DELAY_MS);
  }

  console.log(`Done. success=${ok}, failed=${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
