#!/usr/bin/env node
/**
 * Crawl SegmentFault articles (slow / resumable).
 * Uses Puppeteer to pass WAF challenge.
 *
 * Usage:
 *   node scripts/crawl-sf.mjs              # crawl next batch (default 5)
 *   node scripts/crawl-sf.mjs --batch 10
 *   node scripts/crawl-sf.mjs --discover 2 # discover article URLs from page 2
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_FILE = path.join(ROOT, "scripts/sf-crawl-state.json");
const OUT_DIR = path.join(ROOT, "apps/web/src/content/blog");
const BATCH = Number(process.argv.find((a, i) => process.argv[i - 1] === "--batch") ?? 5);

function slugFromTitle(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "")
    .slice(0, 80);
}

function formatPubDate(iso) {
  if (!iso) return "Jan 01 2024";
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${Number(d)} ${y}`;
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  const page1 = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/sf-articles-page1.json"), "utf8"));
  return { articles: page1, lastPageDiscovered: 1 };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function htmlToMarkdown(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractArticle(page) {
  return page.evaluate(() => {
    const art = document.querySelector(".article-content, .article__content, #articleContent");
    const title = document.querySelector("h1")?.innerText?.trim() ?? document.title;
    const date =
      document.querySelector("time")?.innerText?.trim()?.split(" ")[0] ??
      [...document.querySelectorAll("a")].find((a) => /^\d{4}-\d{2}-\d{2}/.test(a.innerText))?.innerText?.split(" ")[0];
    const tags = [...document.querySelectorAll(".article-tags a, .article__tags a")].map((a) => a.innerText.trim());
    const desc = art?.querySelector("p")?.innerText?.trim()?.slice(0, 160) ?? title;
    return {
      title,
      date,
      tags,
      desc,
      html: art?.innerHTML ?? "",
      textLen: art?.innerText?.length ?? 0,
    };
  });
}

async function discoverPage(browser, pageNum) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  const url =
    pageNum <= 1
      ? "https://segmentfault.com/u/linong/articles"
      : `https://segmentfault.com/u/linong/articles?page=${pageNum}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  // SafeLine WAF challenge
  await page.waitForFunction(
    () => [...document.querySelectorAll("a")].some((a) => /\/a\/\d+$/.test(a.href)),
    { timeout: 45000 }
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
  const items = await page.evaluate(() =>
    [...document.querySelectorAll("a")]
      .filter((a) => /\/a\/\d+$/.test(a.href))
      .map((a) => ({ title: a.innerText.trim(), url: a.href.split("?")[0] }))
      .filter((x) => x.title.length > 8)
      .filter((x, i, arr) => arr.findIndex((y) => y.url === x.url) === i)
  );
  await page.close();
  return items.map((item) => ({
    id: item.url.match(/\/a\/(\d+)/)?.[1] ?? item.url,
    title: item.title,
    url: item.url,
    date: "",
    page: pageNum,
    crawled: false,
  }));
}

function writeMarkdown(article, data, body) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const slug = `sf-${article.id}`;
  const file = path.join(OUT_DIR, `${slug}.md`);
  const fm = [
    "---",
    `title: ${JSON.stringify(data.title)}`,
    `description: ${JSON.stringify(data.desc || data.title)}`,
    `pubDate: ${JSON.stringify(formatPubDate((data.date || article.date || "").slice(0, 10)))}`,
    `source: segmentfault`,
    `sourceUrl: ${JSON.stringify(article.url)}`,
    `badge: 思否`,
    data.tags?.length ? `tags: ${JSON.stringify(data.tags)}` : null,
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  fs.writeFileSync(file, `${fm}\n${body}\n\n---\n\n> 原文：[SegmentFault](${article.url})\n`);
  return file;
}

async function main() {
  const discoverPageNum = process.argv.find((a, i) => process.argv[i - 1] === "--discover");
  const discoverAll = process.argv.includes("--discover-all");
  const crawlAll = process.argv.includes("--crawl-all");
  const state = loadState();
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  if (discoverAll) {
    for (let p = 2; p <= 9; p++) {
      console.log(`Discovering page ${p}...`);
      const found = await discoverPage(browser, p);
      const existing = new Set(state.articles.map((a) => a.url));
      let added = 0;
      for (const item of found) {
        if (!existing.has(item.url)) {
          state.articles.push(item);
          existing.add(item.url);
          added++;
        }
      }
      state.lastPageDiscovered = Math.max(state.lastPageDiscovered ?? 1, p);
      console.log(`  +${added} (page total ${found.length}), queue ${state.articles.length}`);
      saveState(state);
      await new Promise((r) => setTimeout(r, 2000));
    }
    await browser.close();
    return;
  }

  if (discoverPageNum) {
    const n = Number(discoverPageNum);
    console.log(`Discovering page ${n}...`);
    const found = await discoverPage(browser, n);
    const existing = new Set(state.articles.map((a) => a.url));
    for (const item of found) {
      if (!existing.has(item.url)) state.articles.push(item);
    }
    state.lastPageDiscovered = Math.max(state.lastPageDiscovered ?? 1, n);
    saveState(state);
    console.log(`Added ${found.length} articles, total ${state.articles.length}`);
    await browser.close();
    return;
  }

  if (crawlAll) {
    let round = 0;
    while (state.articles.some((a) => !a.crawled)) {
      round++;
      const pending = state.articles.filter((a) => !a.crawled).slice(0, BATCH);
      console.log(`\n=== crawl round ${round}, batch ${pending.length} ===`);
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      for (const article of pending) {
        console.log(`Crawling: ${article.title}`);
        try {
          await page.goto(article.url, { waitUntil: "domcontentloaded", timeout: 90000 });
          await page.waitForFunction(
            () => (document.querySelector(".article-content")?.innerText?.length ?? 0) > 100,
            { timeout: 45000 }
          ).catch(() => {});
          await new Promise((r) => setTimeout(r, 1500));
          const data = await extractArticle(page);
          if (data.textLen < 100) {
            console.warn("  ⚠ Content too short, skipping (WAF?)");
            continue;
          }
          const body = htmlToMarkdown(data.html) || data.desc;
          const file = writeMarkdown(article, data, body);
          article.crawled = true;
          article.localFile = path.relative(ROOT, file);
          article.crawledAt = new Date().toISOString();
          console.log(`  ✓ ${path.basename(file)}`);
        } catch (err) {
          console.error(`  ✗ ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      await page.close();
      saveState(state);
      const done = state.articles.filter((a) => a.crawled).length;
      console.log(`Progress: ${done}/${state.articles.length}`);
    }
    await browser.close();
    return;
  }

  const pending = state.articles.filter((a) => !a.crawled);
  const batch = pending.slice(0, BATCH);
  if (batch.length === 0) {
    console.log("No pending articles. Run with --discover N for next page.");
    await browser.close();
    return;
  }

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  for (const article of batch) {
    console.log(`Crawling: ${article.title}`);
    try {
      await page.goto(article.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(
        () => (document.querySelector(".article-content")?.innerText?.length ?? 0) > 100,
        { timeout: 45000 }
      ).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      const data = await extractArticle(page);
      if (data.textLen < 100) {
        console.warn("  ⚠ Content too short, skipping (WAF?)");
        continue;
      }
      const body = htmlToMarkdown(data.html) || data.desc;
      const file = writeMarkdown(article, data, body);
      article.crawled = true;
      article.localFile = path.relative(ROOT, file);
      article.crawledAt = new Date().toISOString();
      console.log(`  ✓ ${file}`);
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  await page.close();
  saveState(state);
  const done = state.articles.filter((a) => a.crawled).length;
  console.log(`Progress: ${done}/${state.articles.length}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
