import puppeteer from 'puppeteer';

function launch() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

// Fresh page per direction so no key-state residue carries over.
async function probe(browser, url, key, ms) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__wanderDebug && window.__wanderDebug.youId, { timeout: 20000 });
  const b = await page.evaluate(() => ({ x: window.__wanderDebug.renderX, y: window.__wanderDebug.renderY }));
  await page.keyboard.down(key);
  await new Promise((r) => setTimeout(r, ms));
  await page.keyboard.up(key);
  await new Promise((r) => setTimeout(r, 200));
  const a = await page.evaluate(() => ({ x: window.__wanderDebug.renderX, y: window.__wanderDebug.renderY }));
  await page.close();
  return { key, dx: +(a.x - b.x).toFixed(3), dy: +(a.y - b.y).toFixed(3), errs };
}

(async () => {
  const browser = await launch();
  try {
    const url = 'http://localhost:4321/wander?devUserId=iso';
    for (const k of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft']) {
      const r = await probe(browser, url, k, 700);
      console.log(`DEV_USER ${k}: dx=${r.dx} dy=${r.dy} errs=${r.errs.length ? r.errs.join('|') : 'none'}`);
    }
  } finally {
    await browser.close();
  }
})();
