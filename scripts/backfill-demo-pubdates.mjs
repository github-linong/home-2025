#!/usr/bin/env node
/**
 * Backfill demo pubDate when still set to the migration placeholder 2019-06-01.
 * Sources (priority):
 *  1) Explicit date in filename / demoUrl path (YYYY-MM-DD / YYYYMMDD / YYYY-M-D)
 *  2) SegmentFault article id → crawled date or linked blog pubDate
 *  3) relatedPosts → blog pubDate
 *  4) Blog body references to /static/html/... or /demos/html/...
 *  5) Sibling dated files (e.g. 架构图编辑器-20220717 → 架构图编辑器)
 *
 * Dry-run by default. Pass --write to apply.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const demosDir = path.join(root, "apps/web/src/content/demos");
const blogDir = path.join(root, "apps/web/src/content/blog");
const PLACEHOLDER = "2019-06-01";
const write = process.argv.includes("--write");

function listMd(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMd(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function splitFrontmatter(raw) {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  const fm = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  return { fm, body, raw };
}

function parseBlogDate(raw) {
  const s = String(raw || "").trim().replace(/^"|"$/g, "");
  const tryParse = (fmt, value) => {
    // minimal parser without deps
    if (fmt === "iso") {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    }
    if (fmt === "mdY") {
      const m = value.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
      if (!m) return null;
      const months = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
        apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
        aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
        nov: 11, november: 11, dec: 12, december: 12,
      };
      const mo = months[m[1].toLowerCase()];
      if (!mo) return null;
      return `${m[3]}-${String(mo).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    }
    return null;
  };
  return tryParse("iso", s) || tryParse("mdY", s);
}

function validDate(y, mo, d) {
  if (y < 2015 || y > 2026) return false;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function fmt(y, mo, d) {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractAssetDates(text) {
  const dates = new Set();
  // File header authored date: ` * @Date: 2021-02-04 15:50:34`
  for (const m of text.matchAll(/@Date:\s*(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (validDate(y, mo, d)) dates.add(fmt(y, mo, d));
  }
  // Dated static assets: sw-20190621.js, build-20200318.css
  for (const m of text.matchAll(
    /(?:^|[^\w])(?:sw|build|release|bundle|app|main)[-_](20\d{2})(\d{2})(\d{2})\.(?:js|css)\b/gi,
  )) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (validDate(y, mo, d)) dates.add(fmt(y, mo, d));
  }
  return [...dates];
}

function readDemoHtml(demoUrl) {
  if (!demoUrl) return null;
  const htmlName = (demoUrl.match(/\/demos\/html\/([^/?#]+)/) || [])[1];
  if (!htmlName) return null;
  const candidates = [
    path.join(root, "apps/web/public/demos/html", htmlName),
    path.join(
      "/Users/lnmacmini/Desktop/123.56.16.33-20240814/lilnong/static/html",
      htmlName,
    ),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  return null;
}

/** Pull explicit calendar dates from a path/stem. */
function extractPathDate(name) {
  const s = String(name || "");
  let m = s.match(/(?<!\d)(20\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (m) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (validDate(y, mo, d)) return fmt(y, mo, d);
  }
  m = s.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const y = +m[1],
      mo = +m[2],
      d = +m[3];
    if (validDate(y, mo, d)) return fmt(y, mo, d);
  }
  // Compact YYMMDD used in some project folders: jgq-230107
  m = s.match(/(?<!\d)([2][0-9])(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const yy = +m[1];
    if (m[0].length === 6 && yy >= 19 && yy <= 25) {
      const y = 2000 + yy,
        mo = +m[2],
        d = +m[3];
      if (validDate(y, mo, d)) return fmt(y, mo, d);
    }
  }
  return null;
}

function extractSfIds(...parts) {
  const text = parts.join(" ");
  const ids = new Set();
  for (const m of text.matchAll(/(?<!\d)((?:119|101|102)\d{13})(?!\d)/g)) {
    ids.add(m[1]);
  }
  return [...ids];
}

function loadSfCrawlDates() {
  const map = new Map();
  const p = path.join(root, "scripts/sf-crawl-state.json");
  if (!fs.existsSync(p)) return map;
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const row of data.articles || []) {
    if (row?.id && row?.date) map.set(String(row.id), String(row.date).slice(0, 10));
  }
  return map;
}

function loadBlogIndex() {
  const bySlug = new Map();
  const bySf = new Map();
  const htmlRefs = new Map(); // html stem -> dates[]
  const projectRefs = new Map(); // project folder -> dates[]

  for (const file of listMd(blogDir)) {
    const raw = fs.readFileSync(file, "utf8");
    const split = splitFrontmatter(raw);
    if (!split) continue;
    const pub = split.fm.match(/pubDate:\s*"?([^"\n]+)"?/);
    if (!pub) continue;
    const date = parseBlogDate(pub[1]);
    if (!date) continue;
    const slug = path.basename(file, ".md");
    bySlug.set(slug, date);

    for (const id of extractSfIds(split.fm, slug, split.body.slice(0, 2000))) {
      if (!bySf.has(id)) bySf.set(id, []);
      bySf.get(id).push(date);
    }

    const addHtml = (stem) => {
      if (!htmlRefs.has(stem)) htmlRefs.set(stem, []);
      htmlRefs.get(stem).push(date);
    };
    const addProject = (folder) => {
      if (!projectRefs.has(folder)) projectRefs.set(folder, []);
      projectRefs.get(folder).push(date);
    };

    for (const m of raw.matchAll(/(?:\/static\/html\/|\/demos\/html\/)([^"'?\s#)>]+?)(?:\.html)?(?:["'?\s#)>]|$)/g)) {
      const stem = m[1].replace(/\.html$/i, "");
      if (stem && !stem.includes("/")) addHtml(stem);
    }
    for (const m of raw.matchAll(/(?:\/static\/project\/|\/demos\/project\/)([^/"'?\s#]+)/g)) {
      addProject(m[1]);
    }
  }

  return { bySlug, bySf, htmlRefs, projectRefs };
}

function getFmField(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, "m"));
  return m ? m[1] : null;
}

function getRelatedPosts(fm) {
  const m = fm.match(/relatedPosts:\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function pickBest(candidates) {
  if (!candidates.length) return null;
  const by = new Map();
  for (const c of candidates) {
    if (!by.has(c.source)) by.set(c.source, []);
    by.get(c.source).push(c.date);
  }
  const prefer = [
    "path",
    "html-meta",
    "sf-crawl",
    "related-blog",
    "sf-blog",
    "html-ref",
    "project-ref",
    "sibling",
  ];
  for (const source of prefer) {
    if (!by.has(source)) continue;
    const dates = [...by.get(source)].sort();
    // For path, there's usually one explicit date. For blogs, earliest publish is fine.
    return { date: dates[0], source, all: candidates };
  }
  const dates = candidates.map((c) => c.date).sort();
  return { date: dates[0], source: "other", all: candidates };
}

function buildSiblingDateIndex(demoFiles) {
  /** baseStem -> dates from filename */
  const map = new Map();
  for (const file of demoFiles) {
    const stem = path.basename(file, ".md");
    const d = extractPathDate(stem);
    if (!d) continue;
    const base = stem.replace(/[-_](20\d{2}[-_]?\d{1,2}[-_]?\d{1,2}|20\d{6}).*$/, "");
    if (!base || base === stem) continue;
    if (!map.has(base)) map.set(base, []);
    map.get(base).push(d);
  }
  return map;
}

function replacePubDate(fm, nextDate) {
  if (/^pubDate:/m.test(fm)) {
    return fm.replace(/^pubDate:\s*.*$/m, `pubDate: "${nextDate}"`);
  }
  return `pubDate: "${nextDate}"\n` + fm;
}

function main() {
  const sfCrawl = loadSfCrawlDates();
  const blog = loadBlogIndex();
  const demoFiles = listMd(demosDir);
  const siblings = buildSiblingDateIndex(demoFiles);

  const changes = [];
  let placeholderCount = 0;

  for (const file of demoFiles) {
    const raw = fs.readFileSync(file, "utf8");
    const split = splitFrontmatter(raw);
    if (!split) continue;
    const current = getFmField(split.fm, "pubDate")?.replace(/^"|"$/g, "");
    if (current !== PLACEHOLDER) continue;
    placeholderCount += 1;

    const stem = path.basename(file, ".md");
    const candidates = [];
    const push = (source, date) => {
      if (date && date !== PLACEHOLDER) candidates.push({ source, date });
    };

    push("path", extractPathDate(stem));

    const demoUrl = getFmField(split.fm, "demoUrl") || "";
    const legacyUrl = getFmField(split.fm, "legacyUrl") || "";
    push("path", extractPathDate(demoUrl));
    push("path", extractPathDate(legacyUrl));

    for (const id of extractSfIds(stem, split.fm, demoUrl, legacyUrl)) {
      if (sfCrawl.has(id)) push("sf-crawl", sfCrawl.get(id));
      for (const d of blog.bySf.get(id) || []) push("sf-blog", d);
    }

    for (const slug of getRelatedPosts(split.fm)) {
      if (blog.bySlug.has(slug)) push("related-blog", blog.bySlug.get(slug));
    }

    for (const d of blog.htmlRefs.get(stem) || []) push("html-ref", d);
    const htmlStem = (demoUrl.match(/\/demos\/html\/([^/?#]+?)(?:\.html)?$/) || [])[1];
    if (htmlStem) {
      push("path", extractPathDate(htmlStem));
      for (const d of blog.htmlRefs.get(htmlStem) || []) push("html-ref", d);
    }

    const projectFolder = (demoUrl.match(/\/demos\/project\/([^/?#]+)/) || [])[1];
    if (projectFolder) {
      push("path", extractPathDate(projectFolder));
      for (const d of blog.projectRefs.get(projectFolder) || []) push("project-ref", d);
    }

    const htmlText = readDemoHtml(demoUrl);
    if (htmlText) {
      for (const d of extractAssetDates(htmlText)) push("html-meta", d);
    }

    if (siblings.has(stem)) {
      const dates = siblings.get(stem).sort();
      push("sibling", dates[dates.length - 1]); // latest sibling variant
    }

    const best = pickBest(candidates);
    if (!best) continue;

    changes.push({
      file,
      stem,
      from: PLACEHOLDER,
      to: best.date,
      source: best.source,
    });

    if (write) {
      const nextFm = replacePubDate(split.fm, best.date);
      const next = `---\n${nextFm}\n---\n${split.body}`;
      fs.writeFileSync(file, next.endsWith("\n") ? next : next + "\n");
    }
  }

  const bySource = {};
  const byYear = {};
  for (const c of changes) {
    bySource[c.source] = (bySource[c.source] || 0) + 1;
    byYear[c.to.slice(0, 4)] = (byYear[c.to.slice(0, 4)] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        placeholderCount,
        updated: changes.length,
        remaining: placeholderCount - changes.length,
        bySource,
        byYear,
        sample: changes.slice(0, 25).map((c) => ({
          stem: c.stem,
          to: c.to,
          source: c.source,
        })),
      },
      null,
      2,
    ),
  );
}

main();
