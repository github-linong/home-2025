#!/usr/bin/env node
/**
 * Import downloaded JSRUN snippets into the personal site.
 *
 * Reads:  scripts/data/jsrun/snippets/<dir>/
 * Writes: apps/web/public/demos/jsrun/<dir>.html
 *         apps/web/src/content/demos/jsrun-<dir>.md
 *
 * Usage:
 *   node scripts/migrate-jsrun-demos.mjs
 *   node scripts/migrate-jsrun-demos.mjs --limit 20
 *   node scripts/migrate-jsrun-demos.mjs --dry-run
 *   node scripts/migrate-jsrun-demos.mjs --force
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SNIPPETS_DIR = path.join(ROOT, "scripts/data/jsrun/snippets");
const HTML_OUT = path.join(ROOT, "apps/web/public/demos/jsrun");
const MD_OUT = path.join(ROOT, "apps/web/src/content/demos");
const MANIFEST_OUT = path.join(ROOT, "apps/web/src/data/jsrun-demos.json");
const CATALOG_PATH = path.join(ROOT, "scripts/data/jsrun/catalog.json");

function loadCatalogBySlug() {
  if (!fs.existsSync(CATALOG_PATH)) return new Map();
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.data ?? [];
  const map = new Map();
  for (const item of list) {
    if (item?.slug && item.fileType === "code") map.set(item.slug, item);
  }
  return map;
}

function parseArgs(argv) {
  const args = { limit: Infinity, dryRun: false, force: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--force") args.force = true;
  }
  return args;
}

function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(raw, fallback) {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((l) => decodeEntities(l))
    .filter(Boolean);
  let title = lines[0] || fallback;
  if (title.length > 100) title = `${title.slice(0, 97)}...`;
  if (!title || title === "Document" || title === "JSRUN") return fallback;
  return title;
}

function cleanDescription(raw, title, slug) {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((l) => decodeEntities(l))
    .filter(Boolean);
  const rest = lines.slice(1).join(" ").trim();
  if (rest.length >= 12) return rest.slice(0, 200);
  return `JSRUN 代码片段：${title}（原地址 https://jsrun.net/${slug}）。`;
}

function parsePubDate(meta) {
  const raw = meta.createTime || meta.modifyTime || "";
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return "2018-01-01";
}

function yamlQuote(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Strip outer html/body wrappers from JSRUN panel source. */
function unwrapPanelHtml(html) {
  let s = String(html ?? "").trim();
  if (!s) return "";

  // Full documents: keep as body-only later via compose
  if (/<!DOCTYPE|<html[\s>]/i.test(s)) {
    const body = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (body) return body[1].trim();
    return s
      .replace(/<!DOCTYPE[^>]*>/i, "")
      .replace(/<\/?html[^>]*>/gi, "")
      .replace(/<\/?head[^>]*>[\s\S]*?<\/head>/gi, "")
      .replace(/<\/?body[^>]*>/gi, "")
      .trim();
  }

  s = s.replace(/^\s*<body[^>]*>/i, "").replace(/<\/body>\s*$/i, "").trim();
  return s;
}

function composePage({ title, slug, html, css, js }) {
  const body = unwrapPanelHtml(html);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="generator" content="migrate-jsrun-demos.mjs" />
  <meta name="jsrun:slug" content="${escapeHtml(slug)}" />
  <style>
${css || ""}
  </style>
</head>
<body>
${body}
<script>
${js || ""}
</script>
</body>
</html>
`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inferCategory(title) {
  const t = title.toLowerCase();
  if (/vue|element|iview|vant/.test(t)) return "Vue";
  if (/react/.test(t)) return "React";
  if (/canvas|svg|echarts|chart|three/.test(t)) return "图形";
  if (/flex|grid|css|动画|animation|布局|margin|padding|float|bfc/.test(t)) return "CSS";
  if (/jquery|拖拽|排序|scroll|事件/.test(t)) return "交互";
  if (/input|form|select|textarea|表单/.test(t)) return "表单";
  // Prefer 实验 over JSRUN so search tags don't split jsrun / JSRUN
  return "实验";
}

function buildMarkdown(entry) {
  const lines = [
    "---",
    `title: ${yamlQuote(entry.title)}`,
    `description: ${yamlQuote(entry.description)}`,
    `pubDate: ${yamlQuote(entry.pubDate)}`,
    "type: web",
    `demoUrl: ${yamlQuote(entry.demoUrl)}`,
    `legacyUrl: ${yamlQuote(entry.legacyUrl)}`,
    `category: ${yamlQuote(entry.category)}`,
    `badge: ${yamlQuote(entry.badge)}`,
    `tags: [${entry.tags.map(yamlQuote).join(", ")}]`,
    "---",
    "",
    `从 [JSRUN / ${entry.jsrunSlug}](${entry.legacyUrl}) 迁移的历史代码片段。`,
    "",
  ];
  return lines.join("\n");
}

function listSnippetDirs() {
  if (!fs.existsSync(SNIPPETS_DIR)) {
    throw new Error(`Missing snippets dir: ${SNIPPETS_DIR}`);
  }
  return fs
    .readdirSync(SNIPPETS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function main() {
  const args = parseArgs(process.argv);
  const dirs = listSnippetDirs();
  const batch = dirs.slice(0, args.limit);
  const catalogBySlug = loadCatalogBySlug();

  console.log(
    `snippets=${dirs.length} | this run=${batch.length} | catalog=${catalogBySlug.size} | out html=${HTML_OUT} | dryRun=${args.dryRun}`,
  );

  if (!args.dryRun) {
    fs.mkdirSync(HTML_OUT, { recursive: true });
  }

  let written = 0;
  let skipped = 0;

  for (const dirName of batch) {
    const dir = path.join(SNIPPETS_DIR, dirName);
    const metaPath = path.join(dir, "meta.json");
    if (!fs.existsSync(metaPath)) {
      console.warn(`skip ${dirName}: no meta.json`);
      skipped++;
      continue;
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const slug = meta.slug || dirName.split("__")[0];
    const catalog = catalogBySlug.get(slug) ?? {};
    const rawTitle = meta.title || catalog.title || slug;
    const title = cleanTitle(rawTitle, slug);
    const description = cleanDescription(rawTitle, title, slug);
    const pubDate = parsePubDate({
      createTime: meta.createTime || catalog.createTime,
      modifyTime: meta.modifyTime || catalog.modifyTime,
    });
    const category = inferCategory(title);
    const contentSlug = `jsrun-${dirName}`;
    const htmlFile = `${dirName}.html`;
    const demoUrl = `/demos/jsrun/${htmlFile}`;
    const legacyUrl = `https://jsrun.net/${slug}`;
    const htmlOutPath = path.join(HTML_OUT, htmlFile);
    const mdOutPath = path.join(MD_OUT, `${contentSlug}.md`);

    if (!args.force && fs.existsSync(htmlOutPath) && fs.existsSync(mdOutPath)) {
      skipped++;
      continue;
    }

    const html = fs.existsSync(path.join(dir, "source.html"))
      ? fs.readFileSync(path.join(dir, "source.html"), "utf8")
      : "";
    const css = fs.existsSync(path.join(dir, "source.css"))
      ? fs.readFileSync(path.join(dir, "source.css"), "utf8")
      : "";
    const js = fs.existsSync(path.join(dir, "source.js"))
      ? fs.readFileSync(path.join(dir, "source.js"), "utf8")
      : "";

    const page = composePage({ title, slug, html, css, js });
    const md = buildMarkdown({
      title,
      description,
      pubDate,
      demoUrl,
      legacyUrl,
      category,
      badge: "JSRUN",
      tags: category === "实验" ? ["jsrun", "legacy"] : ["jsrun", "legacy", category],
      jsrunSlug: slug,
    });

    if (args.dryRun) {
      console.log(`- ${contentSlug}\t${pubDate}\t${title.slice(0, 50)}`);
      written++;
      continue;
    }

    fs.writeFileSync(htmlOutPath, page);
    fs.writeFileSync(mdOutPath, md);
    written++;
  }

  if (!args.dryRun) {
    // Rebuild full manifest from disk so partial runs stay accurate
    const allHtml = fs
      .readdirSync(HTML_OUT)
      .filter((f) => f.endsWith(".html"))
      .sort();
    const full = {
      version: 1,
      migratedAt: new Date().toISOString(),
      count: allHtml.length,
      demos: allHtml.map((file) => {
        const dirName = file.replace(/\.html$/, "");
        const contentSlug = `jsrun-${dirName}`;
        const mdPath = path.join(MD_OUT, `${contentSlug}.md`);
        let title = dirName;
        if (fs.existsSync(mdPath)) {
          const m = fs.readFileSync(mdPath, "utf8").match(/^title:\s*"([^"]+)"/m);
          if (m) title = m[1];
        }
        return {
          file,
          dirName,
          contentSlug,
          title,
          url: `/demos/jsrun/${file}`,
        };
      }),
    };
    fs.writeFileSync(MANIFEST_OUT, JSON.stringify(full, null, 2));
  }

  console.log(`Done. written=${written} skipped=${skipped}`);
  if (!args.dryRun) {
    console.log(`HTML → ${HTML_OUT}`);
    console.log(`MD   → ${MD_OUT}/jsrun-*.md`);
    console.log(`Manifest → ${MANIFEST_OUT}`);
  }
}

main();
