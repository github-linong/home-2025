/**
 * Import SegmentFault Q&A from crawled JSON into apps/web/src/content/blog/
 * and generate Q&A sidecar JSON (original content only).
 * Run `node scripts/optimize-sf-answers-llm.mjs` afterwards for AI versions.
 *
 * Usage: node scripts/import-sf-answers.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "apps/web/src/content/blog");
const QA_DATA_DIR = path.join(ROOT, "apps/web/src/data/sf-answers");

/** Removed: original answers too low-quality or misleading */
const BLOCKLIST = new Set([
  "1020000007668259",
  "1020000038566423",
  "1020000013517658",
  "1020000024473403",
  "1020000040713282",
  "1020000044724366",
  "1020000041230902",
  "1020000039677185",
]);

const VOTES_JSON = path.join(__dirname, "sf-answers-votes-top100.json");
const NEWEST_JSON = path.join(__dirname, "sf-answers-newest-top100.json");

const OTHER_ANSWER_RE =
  /(?:^|[\s\S])(?=[a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff\u4e00-\u9fff]*\d+\.?\d*k\d+发布于)/;
const LINONG_HEADER_RE =
  /^linong\d+\.?\d*k\d+发布于\s+(?:\d{4}-\d{2}-\d{2}|\d+\s*月\s*\d+\s*日[^✓]*?)?(?:\s*北京|\s*浙江|\s*广东|\s*安徽|\s*巴基斯坦)?(?:\s*更新于[^✓]*?)?(?:\s*✓\s*已被采纳)?\s*/i;
const FOOTER_RE = /(?:有用\d*回复举报|查看全部\s*\d+\s*个回答).*$/s;

function extractLinongAnswer(snippet) {
  if (!snippet?.trim()) return "";

  const idx = snippet.search(/linong\d+\.?\d*k\d+发布于/i);
  if (idx === -1) return "";

  let content = snippet.slice(idx);
  content = content.replace(LINONG_HEADER_RE, "");
  content = content.replace(/✓\s*已被采纳/g, "");

  const otherIdx = content.search(OTHER_ANSWER_RE);
  if (otherIdx > 0) content = content.slice(0, otherIdx);

  content = content.replace(FOOTER_RE, "").trim();
  return content;
}

function formatBody(raw) {
  if (!raw) return "";

  const bracketIdx = raw.search(/\[\s*\{/);
  if (bracketIdx === -1) {
    return raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  const prose = raw.slice(0, bracketIdx).trim();
  const code = raw.slice(bracketIdx).trim();
  const parts = [];

  if (prose) {
    parts.push(
      prose
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n\n")
    );
  }
  if (code) parts.push("```js\n" + code + "\n```");
  return parts.join("\n\n");
}

function plainText(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[{}\[\]`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePubDate(value) {
  if (!value || value === "null") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const m = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}`);
  return null;
}

function formatPubDate(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeYaml(str) {
  return str.replace(/"/g, '\\"').replace(/\n/g, " ");
}

function inferTags(title, body) {
  const text = `${title} ${body}`.toLowerCase();
  const rules = [
    ["Vue", /vue|element|el-/],
    ["React", /react/],
    ["JavaScript", /javascript|js\b|es6/],
    ["CSS", /css|flex|ellipsis/],
    ["Node.js", /node\.?js/],
    ["Canvas", /canvas/],
    ["正则", /正则/],
    ["跨域", /跨域|cors|jsonp/],
    ["jQuery", /jquery|\$\(/],
  ];
  const tags = rules.filter(([, re]) => re.test(text)).map(([tag]) => tag);
  return tags.length ? tags.slice(0, 4) : ["问答"];
}

function loadRows(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return data.rows ?? [];
}

function mergeRows() {
  const byId = new Map();
  for (const row of loadRows(VOTES_JSON)) {
    byId.set(row.answerId, { ...row, sort: "votes" });
  }
  for (const row of loadRows(NEWEST_JSON)) {
    const existing = byId.get(row.answerId);
    if (!existing) {
      byId.set(row.answerId, { ...row, sort: "newest" });
      continue;
    }
    if (!existing.answerSnippet?.trim() && row.answerSnippet?.trim()) {
      byId.set(row.answerId, { ...existing, ...row, sort: existing.sort });
    }
  }
  return [...byId.values()];
}

function buildMarkdown(row, body) {
  const pubDate = parsePubDate(row.publishedAt) ?? new Date("2026-01-01");
  const questionUrl = `https://segmentfault.com/q/${row.questionId}`;
  const desc = plainText(body).slice(0, 160);
  const tags = inferTags(row.questionTitle, body);
  const tagYaml = tags.map((t) => `"${t}"`).join(",");
  const votes = row.useful ?? row.votes;

  const fm = [
    "---",
    `title: "${escapeYaml(row.questionTitle)}"`,
    `description: "${escapeYaml(desc)}"`,
    `pubDate: "${formatPubDate(pubDate)}"`,
    `badge: "思否问答"`,
    `tags: [${tagYaml}]`,
    `source: "segmentfault"`,
    `sourceUrl: "${row.url}"`,
    `kind: "answer"`,
    `answerId: "${row.answerId}"`,
    votes != null && votes > 0 ? `votes: ${votes}` : null,
    row.accepted ? `accepted: true` : null,
    `questionUrl: "${questionUrl}"`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  return fm + "\n\n" + body + "\n";
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(QA_DATA_DIR, { recursive: true });

  const rows = mergeRows();
  let written = 0;
  let skipped = 0;

  for (const row of rows) {
    if (BLOCKLIST.has(row.answerId)) continue;
    const raw = extractLinongAnswer(row.answerSnippet);
    const answerOriginal = formatBody(raw);
    if (!answerOriginal || answerOriginal.length < 8) {
      skipped++;
      continue;
    }

    const jsonPath = path.join(QA_DATA_DIR, `${row.answerId}.json`);
    const existing = fs.existsSync(jsonPath)
      ? JSON.parse(fs.readFileSync(jsonPath, "utf8"))
      : {};

    const sidecar = {
      answerId: row.answerId,
      questionId: row.questionId,
      questionOriginal: row.questionBody?.trim() || row.questionTitle,
      answerOriginal,
      questionOptimized: ["llm", "cursor"].includes(existing.optimizedBy) ? existing.questionOptimized : "",
      answerOptimized: ["llm", "cursor"].includes(existing.optimizedBy) ? existing.answerOptimized : "",
      optimizedBy: ["llm", "cursor"].includes(existing.optimizedBy) ? existing.optimizedBy : "",
      optimizedAt: ["llm", "cursor"].includes(existing.optimizedBy) ? existing.optimizedAt : "",
      llmModel: ["llm", "cursor"].includes(existing.optimizedBy) ? existing.llmModel : "",
    };

    const filename = `sf-a-${row.answerId}.md`;
    const bodyForMd = sidecar.answerOptimized?.trim() || answerOriginal;
    fs.writeFileSync(path.join(OUT_DIR, filename), buildMarkdown(row, bodyForMd), "utf8");
    fs.writeFileSync(jsonPath, JSON.stringify(sidecar, null, 2), "utf8");
    written++;
  }

  console.log(`Imported ${written} answers (+ JSON sidecars), skipped ${skipped}.`);
}

main();
