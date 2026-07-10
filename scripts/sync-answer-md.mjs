#!/usr/bin/env node
/** Sync blog markdown from sf-answers JSON sidecar. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const QA_DIR = path.join(ROOT, "apps/web/src/data/sf-answers");
const BLOG_DIR = path.join(ROOT, "apps/web/src/content/blog");

function yamlQuote(value) {
  return JSON.stringify(String(value).replace(/\s+/g, " ").slice(0, 160));
}

const ids = process.argv.slice(2);
const files = ids.length
  ? ids.map((id) => path.join(QA_DIR, `${id}.json`))
  : fs.readdirSync(QA_DIR).filter((f) => f.endsWith(".json")).map((f) => path.join(QA_DIR, f));

for (const file of files) {
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!record.answerOptimized?.trim()) continue;

  const mdPath = path.join(BLOG_DIR, `sf-a-${record.answerId}.md`);
  if (!fs.existsSync(mdPath)) continue;

  const raw = fs.readFileSync(mdPath, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) continue;

  const desc = yamlQuote(record.answerOptimized);
  let fm = m[1];
  if (/^description:\s/m.test(fm)) {
    fm = fm.replace(/^description:\s.*$/m, `description: ${desc}`);
  } else {
    fm += `\ndescription: ${desc}`;
  }

  fs.writeFileSync(mdPath, `---\n${fm}\n---\n\n${record.answerOptimized}\n`, "utf8");
  console.log("synced", record.answerId);
}
