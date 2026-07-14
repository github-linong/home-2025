#!/usr/bin/env node
/**
 * Download public JSRUN snippets via raw endpoints (no login).
 *
 * STRICTLY SERIAL: finish one snippet (html → css → js → write files)
 * before starting the next. Never parallel. Polite delays between every request
 * and an extra gap between snippets so we do not overload jsrun.net.
 *
 * Catalog JSON shape (API export):
 *   { data: [ { fileType, slug, title, id, ... }, ... ] }
 * or a bare array of the same items.
 *
 * Usage:
 *   node scripts/download-jsrun.mjs --catalog path/to/list.json --limit 5
 *   node scripts/download-jsrun.mjs --catalog path/to/list.json
 *   node scripts/download-jsrun.mjs --discover --user 983409260qqcom --limit 10
 *
 * Options:
 *   --catalog <file>   Catalog JSON (preferred)
 *   --discover         Scrape public user pages for slugs
 *   --user <id>        JSRUN user id for --discover (default: 983409260qqcom)
 *   --out <dir>        Output root (default: scripts/data/jsrun)
 *   --limit <n>        Max snippets this run (0 = all)
 *   --delay <ms>       Pause after each HTTP request (default: 1500)
 *   --gap <ms>         Extra pause AFTER each finished snippet (default: 2500)
 *   --page-delay <ms>  Pause between discover pages (default: 2500)
 *   --max-pages <n>    Discover page cap (default: 200)
 *   --force            Re-download even if meta.json exists
 *   --dry-run          List targets only
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const DEFAULT_USER = "983409260qqcom";
const DEFAULT_OUT = path.join(ROOT, "scripts/data/jsrun");
const USER_AGENT =
  "lilnong.top-jsrun-archive/1.0 (+personal backup; polite crawl; contact via lilnong.top)";

function argValue(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

if (hasFlag("--concurrency")) {
  console.warn(
    "Ignored --concurrency: this script always processes one snippet at a time.",
  );
}

const CONFIG = {
  catalog: argValue("--catalog"),
  discover: hasFlag("--discover"),
  user: argValue("--user", DEFAULT_USER),
  outDir: path.resolve(argValue("--out", DEFAULT_OUT)),
  limit: Number(argValue("--limit", "0")) || 0,
  // Floor delays so accidental --delay 0 cannot hammer the host
  delayMs: Math.max(800, Number(argValue("--delay", "1500")) || 1500),
  gapMs: Math.max(1000, Number(argValue("--gap", "2500")) || 2500),
  pageDelayMs: Math.max(1000, Number(argValue("--page-delay", "2500")) || 2500),
  maxPages: Math.max(1, Number(argValue("--max-pages", "200")) || 200),
  force: hasFlag("--force"),
  dryRun: hasFlag("--dry-run"),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeTitle(title) {
  return String(title ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&mdash;/g, "—")
    .replace(/\r\n/g, "\n")
    .trim();
}

function loadCatalog(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : null;
  if (!list) {
    throw new Error(`Catalog must be an array or { data: [] }: ${filePath}`);
  }

  const items = [];
  const seen = new Set();
  for (const item of list) {
    if (item?.fileType && item.fileType !== "code") continue;
    const slug = item?.slug;
    if (!slug || typeof slug !== "string" || seen.has(slug)) continue;
    seen.add(slug);
    items.push({
      id: item.id ?? null,
      slug,
      title: sanitizeTitle(item.title),
      createTime: item.createTime ?? null,
      modifyTime: item.modifyTime ?? null,
      type: item.type ?? null,
      isPublic: item.isPublic ?? true,
    });
  }
  return items;
}

function loadState(statePath) {
  if (!fs.existsSync(statePath)) {
    return { downloaded: {}, failed: {}, startedAt: new Date().toISOString() };
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState(statePath, state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function fetchText(url, { retries = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
        },
        redirect: "follow",
      });

      // Soft rate-limit / server stress
      if (res.status === 429 || res.status === 503 || res.status >= 500) {
        const backoff = CONFIG.delayMs * Math.pow(2, attempt);
        console.warn(`  ! HTTP ${res.status} ${url} — backoff ${backoff}ms (try ${attempt}/${retries})`);
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      const text = await res.text();
      await sleep(CONFIG.delayMs);
      return text;
    } catch (err) {
      lastError = err;
      const backoff = CONFIG.delayMs * Math.pow(2, attempt - 1);
      console.warn(`  ! ${err.message || err} — retry in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

function composeIndex({ title, slug, html, css, js }) {
  const safeTitle = title || slug;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(safeTitle)}</title>
  <meta name="generator" content="download-jsrun.mjs" />
  <meta name="jsrun:slug" content="${escapeHtml(slug)}" />
  <style>
${css || ""}
  </style>
</head>
<body>
${html || ""}
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

function buildCaseCollisionSet(items) {
  const byLower = new Map();
  for (const item of items) {
    const key = item.slug.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, []);
    byLower.get(key).push(item.slug);
  }
  const collisions = new Set();
  for (const slugs of byLower.values()) {
    if (new Set(slugs).size > 1) {
      for (const s of slugs) collisions.add(s.toLowerCase());
    }
  }
  return collisions;
}

/** macOS default FS is case-insensitive — disambiguate colliding slugs with id. */
function snippetDirName(item, caseCollisions) {
  if (item.id != null && caseCollisions.has(item.slug.toLowerCase())) {
    return `${item.slug}__${item.id}`;
  }
  return item.slug;
}

async function downloadSnippet(item, outRoot, caseCollisions) {
  const dirName = snippetDirName(item, caseCollisions);
  const dir = path.join(outRoot, "snippets", dirName);
  ensureDir(dir);

  const html = await fetchText(`https://jsrun.net/${item.slug}.html`);
  const css = await fetchText(`https://jsrun.net/${item.slug}.css`);
  const js = await fetchText(`https://jsrun.net/${item.slug}.js`);

  fs.writeFileSync(path.join(dir, "source.html"), html);
  fs.writeFileSync(path.join(dir, "source.css"), css);
  fs.writeFileSync(path.join(dir, "source.js"), js);
  fs.writeFileSync(
    path.join(dir, "index.html"),
    composeIndex({ title: item.title, slug: item.slug, html, css, js }),
  );
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        ...item,
        dirName,
        source: {
          html: `https://jsrun.net/${item.slug}.html`,
          css: `https://jsrun.net/${item.slug}.css`,
          js: `https://jsrun.net/${item.slug}.js`,
          show: `https://jsrun.net/${item.slug}/show`,
          edit: `https://jsrun.net/${item.slug}/edit`,
        },
        downloadedAt: new Date().toISOString(),
        bytes: {
          html: Buffer.byteLength(html),
          css: Buffer.byteLength(css),
          js: Buffer.byteLength(js),
        },
      },
      null,
      2,
    ),
  );
  return dirName;
}

async function discoverFromUserPages(user) {
  const items = [];
  const seen = new Set();

  for (let page = 1; page <= CONFIG.maxPages; page++) {
    const url =
      page === 1
        ? `https://jsrun.net/u/${encodeURIComponent(user)}`
        : `https://jsrun.net/u/${encodeURIComponent(user)}?page=${page}`;

    console.log(`Discover page ${page}: ${url}`);
    const html = await fetchText(url);
    // After fetchText we already delayed; page-delay adds extra pause between pages
    if (page > 1 || CONFIG.pageDelayMs > CONFIG.delayMs) {
      await sleep(Math.max(0, CONFIG.pageDelayMs - CONFIG.delayMs));
    }

    const slugs = [...html.matchAll(/href="\/([A-Za-z0-9]+Kp)(?:\/(?:show|edit))?"/g)].map(
      (m) => m[1],
    );
    const uniqueOnPage = [...new Set(slugs)];
    if (uniqueOnPage.length === 0) {
      console.log(`  no slugs on page ${page}, stop.`);
      break;
    }

    let added = 0;
    for (const slug of uniqueOnPage) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      items.push({ slug, title: slug, id: null, createTime: null, modifyTime: null });
      added++;
    }
    console.log(`  found ${uniqueOnPage.length} links, +${added} new (total ${items.length})`);

    if (!html.includes(`page=${page + 1}`) && !html.includes(`?page=${page + 1}`)) {
      // Last page heuristic: no next page link
      const hasNext = new RegExp(`[?&]page=${page + 1}\\b`).test(html);
      if (!hasNext && page > 1) {
        // Still continue if page=2 exists pattern elsewhere; stop when page adds nothing new twice
      }
    }
  }

  return items;
}

async function main() {
  if (!CONFIG.catalog && !CONFIG.discover) {
    console.error(
      "Provide --catalog <file.json> or --discover.\nSee header comment in scripts/download-jsrun.mjs",
    );
    process.exit(1);
  }

  ensureDir(CONFIG.outDir);
  const statePath = path.join(CONFIG.outDir, "state.json");
  const manifestPath = path.join(CONFIG.outDir, "manifest.json");
  const state = loadState(statePath);

  let items;
  if (CONFIG.catalog) {
    items = loadCatalog(path.resolve(CONFIG.catalog));
    console.log(`Loaded catalog: ${items.length} code snippets from ${CONFIG.catalog}`);
  } else {
    items = await discoverFromUserPages(CONFIG.user);
    const discoveredPath = path.join(CONFIG.outDir, "discovered.json");
    fs.writeFileSync(discoveredPath, JSON.stringify({ user: CONFIG.user, data: items }, null, 2));
    console.log(`Discovered ${items.length} slugs → ${discoveredPath}`);
  }

  const caseCollisions = buildCaseCollisionSet(items);
  if (caseCollisions.size) {
    console.log(
      `Case-insensitive collisions: ${caseCollisions.size} slug groups → dirs use slug__id`,
    );
  }

  const pending = items.filter((item) => {
    if (CONFIG.force) return true;
    const dirName = snippetDirName(item, caseCollisions);
    const metaPath = path.join(CONFIG.outDir, "snippets", dirName, "meta.json");
    if (fs.existsSync(metaPath)) return false;
    if (state.downloaded?.[dirName] || state.downloaded?.[item.slug]) {
      // Legacy state keyed by slug only — still require disambiguated dir for collisions
      if (!caseCollisions.has(item.slug.toLowerCase()) && state.downloaded?.[item.slug]) {
        return false;
      }
      if (state.downloaded?.[dirName]) return false;
    }
    return true;
  });

  const batch = CONFIG.limit > 0 ? pending.slice(0, CONFIG.limit) : pending;

  const approxSnippetSec = (
    (CONFIG.delayMs * 3 + CONFIG.gapMs) /
    1000
  ).toFixed(1);
  console.log(
    [
      `out: ${CONFIG.outDir}`,
      `pending: ${pending.length}/${items.length}`,
      `this run: ${batch.length}`,
      `mode: serial (one-by-one)`,
      `delay: ${CONFIG.delayMs}ms/request`,
      `gap: ${CONFIG.gapMs}ms/snippet`,
      `~${approxSnippetSec}s per snippet`,
      CONFIG.dryRun ? "DRY-RUN" : "",
    ]
      .filter(Boolean)
      .join(" | "),
  );

  if (CONFIG.dryRun) {
    for (const item of batch) {
      const dirName = snippetDirName(item, caseCollisions);
      console.log(
        `- ${item.slug}\t${dirName}\t${(item.title || "").split("\n")[0].slice(0, 60)}`,
      );
    }
    return;
  }

  let ok = 0;
  let fail = 0;

  // One snippet fully completed before the next starts — no Promise.all / pool.
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const dirName = snippetDirName(item, caseCollisions);
    const label = `${i + 1}/${batch.length} ${item.slug}`;
    console.log(`→ ${label} → ${dirName} ${(item.title || "").split("\n")[0].slice(0, 36)}`);
    try {
      await downloadSnippet(item, CONFIG.outDir, caseCollisions);
      state.downloaded[dirName] = {
        at: new Date().toISOString(),
        title: item.title,
        slug: item.slug,
        id: item.id,
      };
      delete state.failed[dirName];
      delete state.failed[item.slug];
      ok++;
      saveState(statePath, state);
      console.log(`  ✓ done (${ok} ok / ${fail} fail)`);
    } catch (err) {
      fail++;
      state.failed[dirName] = {
        at: new Date().toISOString(),
        error: String(err.message || err),
        slug: item.slug,
      };
      console.error(`  ✗ ${item.slug}: ${err.message || err}`);
      saveState(statePath, state);
      // Cool down longer after errors
      await sleep(CONFIG.gapMs * 2);
      continue;
    }

    // Extra pause between snippets (after the last request delay already applied)
    if (i < batch.length - 1) {
      console.log(`  … gap ${CONFIG.gapMs}ms before next`);
      await sleep(CONFIG.gapMs);
    }
  }

  saveState(statePath, state);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: CONFIG.catalog ? path.resolve(CONFIG.catalog) : `discover:${CONFIG.user}`,
    totalInCatalog: items.length,
    downloaded: Object.keys(state.downloaded).length,
    failed: Object.keys(state.failed).length,
    rate: {
      mode: "serial",
      delayMs: CONFIG.delayMs,
      gapMs: CONFIG.gapMs,
    },
    items: items.map((item) => {
      const dirName = snippetDirName(item, caseCollisions);
      return {
        slug: item.slug,
        dirName,
        title: item.title,
        status: state.downloaded[dirName] || state.downloaded[item.slug]
          ? "downloaded"
          : state.failed[dirName] || state.failed[item.slug]
            ? "failed"
            : "pending",
      };
    }),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    `Done. ok=${ok} fail=${fail} | state=${statePath} | manifest=${manifestPath}`,
  );
  console.log("Resume is automatic (skips existing meta.json). Always serial.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
