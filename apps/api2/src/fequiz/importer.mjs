/**
 * fequiz 题库导入器（MySQL / 前端面试题）。
 *
 * 数据源：https://github.com/febobo/web-interview （docs/<技术栈>/*.md）
 *
 * 流程：
 *   1. 浅克隆 / 增量拉取仓库到 apps/api2/data/web-interview
 *   2. 遍历 docs/<技术栈>/*.md，解析「题干（H1）+ 参考解析（正文）」
 *   3. 按技术栈分类写入 fe_categories，并为每题打难度分
 *   4. 导入完成后自动执行「全量预处理」：对每道原题生成 6 类题型变体并落库
 *      （分批、断点续传、失败降级离线模板）
 *
 * 幂等：按 (category_id, slug) upsert，可重复运行。
 *
 * Usage: npm run fe:import --prefix apps/api2
 *   FE_SKIP_PREPROCESS=1  可跳过导入后的全量预处理（随后单独跑 npm run fe:preprocess）
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fequizConnect } from "./db.js";
import { preprocessAll } from "./preprocess.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile?.(join(__dirname, "..", "..", ".env"));
} catch {
  /* env already provided */
}

const REPO_URL = process.env.FE_REPO_URL || "https://github.com/febobo/web-interview.git";
const REPO_DIR =
  process.env.FE_REPO_DIR || join(__dirname, "..", "..", "data", "web-interview");

const CATEGORY_INFO = {
  JavaScript: { desc: "JavaScript 核心：闭包、原型、事件循环、this 指向等", order: 1 },
  es6: { desc: "ES6+ 新特性与语法（Promise、解构、模块等）", order: 2 },
  TypeScript: { desc: "TypeScript 类型系统与进阶", order: 3 },
  Vue: { desc: "Vue 2.x 框架面试题", order: 4 },
  Vue3: { desc: "Vue 3 新特性与原理", order: 5 },
  React: { desc: "React 框架与生态", order: 6 },
  NodeJS: { desc: "Node.js 服务端开发", order: 7 },
  css: { desc: "CSS 样式与布局", order: 8 },
  http: { desc: "HTTP/HTTPS 网络协议", order: 9 },
  algorithm: { desc: "算法与数据结构", order: 10 },
  Webpack: { desc: "Webpack 构建与工程化", order: 11 },
  Git: { desc: "Git 版本控制", order: 12 },
  Linux: { desc: "Linux 基础与运维", order: 13 },
  applet: { desc: "小程序开发", order: 14 },
  design: { desc: "设计模式与系统设计", order: 15 },
};

const HARD_HINTS = [
  "原理", "源码", "实现", "机制", "手写", "区别", "优化", "设计", "虚拟dom",
  "diff", "防抖", "节流", "深拷贝", "事件循环", "跨域", "安全", "性能", "缓存",
  "渲染", "回流", "垃圾回收", "闭包", "原型", "作用域", "promise", "async",
  "算法", "复杂度", "并发", "分布式", "微服务",
];
const EASY_HINTS = ["是什么", "理解", "特点", "作用", "简述", "说说", "有哪些", "介绍", "请解释"];

// ── 解析 ────────────────────────────────────────────────────────────────

/** 解析单个 .md 面试题文件：H1 为题干，其余为参考解析。 */
export function parseMdFile(filePath, fileName) {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  let title = null;
  const bodyLines = [];
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)$/);
    if (m && title === null) {
      title = m[1].trim();
      continue;
    }
    if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) continue;
    bodyLines.push(line);
  }
  if (!title) {
    title = basename(fileName, ".md").replace(/[-_]+/g, " ").trim();
  }
  const body = bodyLines.join("\n").replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { title, body };
}

/**
 * 难度打分（1-10 级）：
 *  - 基准 5 分
 *  - 命中困难关键词最多 +4；命中简单关键词最多 -2
 *  - 解析超长（>4000/8000 字符）各 +1
 *  - 收敛到 1..10，并派生 easy/medium/hard 三档（用于旧字段与徽标兜底）
 * @returns {{level: number, difficulty: "easy"|"medium"|"hard"}}
 */
export function difficultyFor(title, body) {
  const text = `${title} ${body}`.toLowerCase();
  let hard = 0;
  let easy = 0;
  for (const k of HARD_HINTS) if (text.includes(k)) hard += 1;
  for (const k of EASY_HINTS) if (text.includes(k)) easy += 1;
  let level = 5 + Math.min(4, hard) - Math.min(2, easy);
  if (body.length > 4000) level += 1;
  if (body.length > 8000) level += 1;
  level = Math.max(1, Math.min(10, level));
  const difficulty = level >= 7 ? "hard" : level >= 4 ? "medium" : "easy";
  return { level, difficulty };
}

function ensureRepo() {
  if (existsSync(REPO_DIR)) {
    try {
      execFileSync("git", ["-C", REPO_DIR, "pull", "--quiet", "--ff-only"], { stdio: "pipe" });
    } catch {
      console.warn("[fequiz:import] pull 失败（可能离线），沿用本地副本");
    }
    return;
  }
  mkdirSync(dirname(REPO_DIR), { recursive: true });
  try {
    execFileSync("git", ["clone", "--depth", "1", "--quiet", REPO_URL, REPO_DIR], { stdio: "pipe" });
  } catch (err) {
    throw new Error(`克隆 ${REPO_URL} 失败，请检查网络：${err?.message || err}`);
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────

async function main() {
  ensureRepo();
  const docsDir = join(REPO_DIR, "docs");
  if (!existsSync(docsDir)) {
    console.error(`[fequiz:import] ${docsDir} 不存在`);
    process.exitCode = 1;
    return;
  }

  const conn = await fequizConnect();

  const catDirs = readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

  const summary = [];
  try {
    for (const catName of catDirs) {
      const info = CATEGORY_INFO[catName] || {
        desc: `web-interview · ${catName}`,
        order: 100 + summary.length,
      };
      const slug = catName.toLowerCase();
      await conn.query(
        `INSERT INTO fe_categories (slug, title, description, source, sort_order)
         VALUES (?, ?, ?, 'web-interview', ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), description = VALUES(description),
           source = VALUES(source), sort_order = VALUES(sort_order)`,
        [slug, catName, info.desc, info.order],
      );
      const [[catRow]] = await conn.query(`SELECT id FROM fe_categories WHERE slug = ?`, [slug]);
      const categoryId = catRow.id;

      const catDir = join(docsDir, catName);
      const files = readdirSync(catDir)
        .filter((f) => f.toLowerCase().endsWith(".md") && !f.startsWith("."))
        .sort();

      let questionCount = 0;
      const diffCount = { easy: 0, medium: 0, hard: 0 };
      for (const file of files) {
        let parsed;
        try {
          parsed = parseMdFile(join(catDir, file), file);
        } catch (err) {
          console.warn(`[fequiz:import] 解析失败 ${catName}/${file}:`, err?.message || err);
          continue;
        }
        if (!parsed.title) continue;
        const { level, difficulty } = difficultyFor(parsed.title, parsed.body);
        const fileSlug = file.slice(0, -3);
        await conn.query(
          `INSERT INTO fe_questions (category_id, slug, title, body, difficulty, difficulty_level, source_file, processed)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title), body = VALUES(body),
             difficulty = VALUES(difficulty), difficulty_level = VALUES(difficulty_level),
             source_file = VALUES(source_file)`,
          [categoryId, fileSlug, parsed.title.slice(0, 500), parsed.body, difficulty, level, file],
        );
        questionCount += 1;
        diffCount[difficulty] += 1;
      }
      summary.push({ category: catName, questions: questionCount, ...diffCount });
    }

    const totals = summary.reduce(
      (acc, s) => {
        acc.questions += s.questions;
        acc.easy += s.easy;
        acc.medium += s.medium;
        acc.hard += s.hard;
        return acc;
      },
      { questions: 0, easy: 0, medium: 0, hard: 0 },
    );
    console.log("[fequiz:import] categories:", summary.length);
    for (const s of summary) {
      console.log(`  ${s.category}: ${s.questions} 题 (easy ${s.easy} / medium ${s.medium} / hard ${s.hard})`);
    }
    console.log("[fequiz:import] total:", JSON.stringify(totals));
  } finally {
    await conn.end();
  }

  // 导入完成后全量预处理（默认开启）。
  if (process.env.FE_SKIP_PREPROCESS === "1") {
    console.log("[fequiz:import] 跳过全量预处理（FE_SKIP_PREPROCESS=1）。可稍后运行 npm run fe:preprocess");
  } else {
    console.log("[fequiz:import] 开始全量预处理（生成 6 类题型）…");
    const conn2 = await fequizConnect();
    try {
      const result = await preprocessAll(conn2);
      console.log("[fequiz:import] 全量预处理完成", JSON.stringify(result));
    } finally {
      await conn2.end();
    }
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[fequiz:import] failed:", err);
    process.exitCode = 1;
  });
}
