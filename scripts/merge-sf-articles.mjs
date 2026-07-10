#!/usr/bin/env node
/** Merge browser-exported article lists into crawl state */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE = path.join(ROOT, "scripts/sf-crawl-state.json");

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node scripts/merge-sf-articles.mjs scripts/sf-page2.json ...");
  process.exit(1);
}

const state = fs.existsSync(STATE)
  ? JSON.parse(fs.readFileSync(STATE, "utf8"))
  : { articles: [], lastPageDiscovered: 1 };

const existing = new Set(state.articles.map((a) => a.url));
let added = 0;

for (const file of files) {
  const items = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  for (const item of items) {
    const url = item.url.replace(/\?.*$/, "");
    if (existing.has(url)) continue;
    state.articles.push({
      id: url.match(/\/a\/(\d+)/)?.[1],
      title: item.title,
      url,
      date: item.date ?? "",
      page: item.page ?? 0,
      crawled: false,
    });
    existing.add(url);
    added++;
  }
}

fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
console.log(`Merged +${added}, total ${state.articles.length}, crawled ${state.articles.filter((a) => a.crawled).length}`);
