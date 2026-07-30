#!/usr/bin/env node
/**
 * Capture live Astro demo heroes with sidebar hidden and optional click-to-load.
 *
 * Usage:
 *   node scripts/capture-demo-heroes.mjs --write --origin=http://127.0.0.1:4321
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "apps/web");
const heroDir = path.join(webRoot, "public/heroes/demo");
const demosDir = path.join(webRoot, "src/content/demos");

const write = process.argv.includes("--write");
const origin = (
  process.argv.find((a) => a.startsWith("--origin="))?.slice("--origin=".length) ||
  "http://127.0.0.1:4321"
).replace(/\/+$/, "");

const require = createRequire(path.join(webRoot, "package.json"));
const sharp = require("sharp");
const puppeteer = require(path.join(root, "node_modules/puppeteer"));

const W = 1200;
const H = 675;

const JOBS = [
  {
    slug: "livelihood-dashboard-guide",
    url: "/demos/livelihood-dashboard/",
    waitMs: 2500,
    title: "民生数据大屏 · 3D 数字人导览",
    badge: "新作",
  },
  {
    slug: "avatar-pointing",
    url: "/demos/avatar-pointing/",
    waitMs: 10000,
    title: "3D 人物指向研究 · Pointing Lab",
    badge: "新作",
    beforeShot: async (page) => {
      // Click load avatar button if present.
      const clicked = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("button")];
        const btn = buttons.find((b) => /加载数字人|Load/i.test(b.textContent || ""));
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clicked) return;
      await page
        .waitForFunction(
          () => {
            const canvas = document.querySelector("canvas");
            return Boolean(canvas && canvas.width > 64 && canvas.height > 64);
          },
          { timeout: 20000 },
        )
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
      // Click a target corner to show pointing intent.
      await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = rect.left + rect.width * 0.82;
        const y = rect.top + rect.height * 0.28;
        canvas.dispatchEvent(
          new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }),
        );
      });
      await new Promise((r) => setTimeout(r, 1200));
    },
  },
  {
    slug: "ai-image-gen",
    url: "/demos/image-gen/",
    waitMs: 1500,
    title: "AI 文生图 · DashScope 多模型",
    badge: "新作",
    beforeShot: async (page) => {
      await page.evaluate(() => {
        const prompt = document.querySelector("#prompt");
        if (prompt) {
          prompt.value =
            "一只橘猫戴着宇航员头盔，漂浮在星空中，背景是蓝色地球，写实风格，电影级光影";
          prompt.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      const clicked = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("button")];
        const btn = buttons.find((b) => /生成/.test(b.textContent || ""));
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (!clicked) return;
      await page
        .waitForFunction(
          () => {
            const img = document.querySelector("img");
            return Boolean(img && img.naturalWidth > 100);
          },
          { timeout: 90000 },
        )
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
    },
  },
];

function upsertHeroImage(fm, relPath) {
  if (/^heroImage:/m.test(fm)) return fm.replace(/^heroImage:.*$/m, `heroImage: "${relPath}"`);
  const lines = fm.split("\n");
  const titleIdx = lines.findIndex((l) => /^title:/.test(l));
  lines.splice(titleIdx >= 0 ? titleIdx + 1 : 0, 0, `heroImage: "${relPath}"`);
  return lines.join("\n");
}

async function isInteresting(pngBuf) {
  const stats = await sharp(pngBuf).stats();
  const channels = stats.channels || [];
  const mean = channels.slice(0, 3).reduce((s, c) => s + (c.mean || 0), 0) / Math.min(3, channels.length);
  const stdev = channels.slice(0, 3).reduce((s, c) => s + (c.stdev || 0), 0) / Math.min(3, channels.length);
  if (mean > 245 && stdev < 12) return false;
  if (stdev < 8) return false;
  return true;
}

async function saveHero(pngBuf, outPath, title, badge) {
  const label = badge || "Demo";
  const overlay = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="36" y="${H - 118}" width="${Math.min(220, 40 + [...label].length * 26)}" height="34" rx="10" fill="#0f766e" fill-opacity="0.92"/>
  <text x="50" y="${H - 94}" font-family="PingFang SC, sans-serif" font-size="17" font-weight="700" fill="#ecfeff">${label}</text>
  <text x="36" y="${H - 48}" font-family="PingFang SC, sans-serif" font-size="26" font-weight="750" fill="#f8fafc">${title.slice(0, 36)}</text>
</svg>`);
  await sharp(pngBuf)
    .resize(W, H, { fit: "cover", position: "centre" })
    .composite([{ input: await sharp(overlay).png().toBuffer(), top: 0, left: 0 }])
    .webp({ quality: 82 })
    .toFile(`${outPath}.tmp`);
  fs.renameSync(`${outPath}.tmp`, outPath);
}

async function main() {
  console.log(`${write ? "WRITE" : "DRY-RUN"} origin=${origin}`);
  if (!write) {
    for (const job of JOBS) console.log(`would capture ${job.slug} ${job.url}`);
    return;
  }
  fs.mkdirSync(heroDir, { recursive: true });
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  try {
    for (const job of JOBS) {
      const page = await browser.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);
      await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
      try {
        await page.goto(`${origin}${job.url}`, { waitUntil: "networkidle2", timeout: 20000 });
        await page.addStyleTag({
          content: `
            .drawer-side, .drawer-toggle, label[for="my-drawer"] { display:none !important; }
            .drawer-content { width:100vw !important; margin:0 !important; }
            [data-system-notice-bar-wrap], [data-notice-inbox], [data-notice-dialog], [data-auth-status] { display:none !important; }
            body { overflow:hidden !important; }
          `,
        });
        if (job.beforeShot) await job.beforeShot(page);
        await new Promise((r) => setTimeout(r, job.waitMs));
        const shot = await page.screenshot({ type: "png", captureBeyondViewport: false });
        if (!(await isInteresting(shot))) throw new Error("screenshot too blank/uniform");
        const outPath = path.join(heroDir, `${job.slug}.webp`);
        await saveHero(shot, outPath, job.title, job.badge);

        const mdPath = path.join(demosDir, `${job.slug}.md`);
        if (fs.existsSync(mdPath)) {
          const raw = fs.readFileSync(mdPath, "utf8");
          const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
          if (m) {
            const nextFm = upsertHeroImage(m[1], `/heroes/demo/${job.slug}.webp`);
            fs.writeFileSync(mdPath, `---\n${nextFm}\n---\n${m[2].startsWith("\n") ? m[2] : `\n${m[2]}`}`);
          }
        }
        console.log(`ok ${job.slug}`);
      } catch (err) {
        console.error(`fail ${job.slug}:`, err.message || err);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
