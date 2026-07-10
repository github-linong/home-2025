#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "sf-discovered-extra.json");

async function extractPage(page, N) {
  const url =
    N <= 1
      ? "https://segmentfault.com/u/linong/articles"
      : `https://segmentfault.com/u/linong/articles?page=${N}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 8000));
  await page
    .waitForFunction(
      () => [...document.querySelectorAll("a")].some((a) => /\/a\/\d+$/.test(a.href)),
      { timeout: 45000 }
    )
    .catch(() => {});

  return page.evaluate((pageNum) => {
    return [...document.querySelectorAll("a")]
      .filter((a) => /\/a\/\d+$/.test(a.href))
      .map((a) => ({
        title: a.innerText.trim(),
        url: a.href.split("?")[0],
        page: pageNum,
      }))
      .filter((x) => x.title.length > 8)
      .filter((x, i, arr) => arr.findIndex((y) => y.url === x.url) === i);
  }, N);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const tab = await browser.newPage();
  await tab.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  const all = [];
  const perPage = {};

  for (let N = 2; N <= 9; N++) {
    console.log(`Page ${N}...`);
    const items = await extractPage(tab, N);
    perPage[N] = items.length;
    all.push(...items);
    console.log(`  ${items.length} articles`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2));

  console.log("\n--- Summary ---");
  console.log("Total:", all.length);
  console.log("Per page:", JSON.stringify(perPage));
  console.log("Sample titles:", all.slice(0, 3).map((x) => x.title));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
