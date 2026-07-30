#!/usr/bin/env node
/**
 * Push URLs to Baidu 普通收录 API.
 *
 * Setup:
 * 1. Verify site at https://ziyuan.baidu.com/
 * 2. Open 普通收录 → API → copy token
 * 3. Set BAIDU_PUSH_TOKEN (and optional BAIDU_PUSH_SITE) in env
 *
 * Usage:
 *   node scripts/baidu-push.mjs
 *   node scripts/baidu-push.mjs --url https://www.lilnong.top/blog/foo/
 *   node scripts/baidu-push.mjs --file urls.txt
 *   node scripts/baidu-push.mjs --recent 10
 *
 * --recent N prefers original (non-SegmentFault) posts, then newest by pubDate.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getBaiduCorePushUrls,
  buildCanonicalUrl,
} from "../apps/web/src/lib/seo.mjs";
import { parseSimpleFrontmatter } from "../apps/web/src/lib/frontmatter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SITE = (
  process.env.BAIDU_PUSH_SITE ||
  process.env.PUBLIC_BASE_URL ||
  "https://www.lilnong.top"
).replace(/\/$/, "");
const TOKEN = process.env.BAIDU_PUSH_TOKEN || "";

function parseArgs(argv) {
  const out = { urls: [], file: "", recent: 0, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--url" && argv[i + 1]) out.urls.push(argv[++i]);
    else if (a === "--file" && argv[i + 1]) out.file = argv[++i];
    else if (a === "--recent" && argv[i + 1]) out.recent = Number(argv[++i]) || 0;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function collectRecentBlogUrls(limit) {
  const blogDir = join(root, "apps/web/src/content/blog");
  if (!existsSync(blogDir)) return [];
  const files = readdirSync(blogDir).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));
  const ranked = [];
  for (const file of files) {
    const full = join(blogDir, file);
    const raw = readFileSync(full, "utf8");
    const meta = parseSimpleFrontmatter(raw);
    const fileSlug = file.replace(/\.mdx?$/, "");
    // Astro `slug` frontmatter overrides the URL slug when present.
    const slugMatch = raw.match(/^slug:\s*["']?(.+?)["']?\s*$/m);
    const slug = slugMatch ? slugMatch[1].trim() : fileSlug;
    if (!meta.pubDate || !slug || slug.startsWith("notice-")) continue;
    const pubDate = new Date(/** @type {string} */ (meta.pubDate));
    if (Number.isNaN(pubDate.valueOf())) continue;
    const isOriginal = !meta.sourceUrl && !fileSlug.startsWith("sf-");
    ranked.push({ pubDate, slug, isOriginal });
  }
  ranked.sort((a, b) => {
    if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
    return b.pubDate - a.pubDate;
  });
  return ranked.slice(0, limit).map((r) => buildCanonicalUrl(SITE, `/blog/${r.slug}/`));
}

function loadUrlsFromFile(filePath) {
  const abs = filePath.startsWith("/") ? filePath : join(root, filePath);
  return readFileSync(abs, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function pushUrls(urls) {
  const endpoint = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(SITE)}&token=${encodeURIComponent(TOKEN)}`;
  const body = urls.join("\n");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function printHelp() {
  console.log(`Baidu 普通收录 URL push

Env:
  BAIDU_PUSH_TOKEN   required (from ziyuan.baidu.com)
  BAIDU_PUSH_SITE    default https://www.lilnong.top

Examples:
  BAIDU_PUSH_TOKEN=xxx node scripts/baidu-push.mjs
  BAIDU_PUSH_TOKEN=xxx node scripts/baidu-push.mjs --recent 5
  BAIDU_PUSH_TOKEN=xxx node scripts/baidu-push.mjs --dry-run --recent 3
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const urls = new Set(getBaiduCorePushUrls(SITE));
  for (const u of args.urls) urls.add(u);
  if (args.file) {
    for (const u of loadUrlsFromFile(args.file)) urls.add(u);
  }
  if (args.recent > 0) {
    for (const u of collectRecentBlogUrls(args.recent)) urls.add(u);
  }

  const list = [...urls];
  console.log(`Site: ${SITE}`);
  console.log(`URLs (${list.length}):`);
  for (const u of list) console.log(`  ${u}`);

  if (args.dryRun) {
    console.log("\nDry run — not calling Baidu API.");
    return;
  }

  if (!TOKEN) {
    console.error(
      "\nMissing BAIDU_PUSH_TOKEN. Get it from 百度搜索资源平台 → 普通收录 → API.",
    );
    process.exit(1);
  }

  const result = await pushUrls(list);
  console.log("\nBaidu response:", JSON.stringify(result.json, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
