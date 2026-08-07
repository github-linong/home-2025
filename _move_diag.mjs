import puppeteer from 'puppeteer';

const BENIGN_NONE = /a^/; // match nothing → capture ALL errors
const logs = [];
const errors = [];

function launch() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function testUrl(browser, url, label) {
  const page = await browser.newPage();
  page.on('console', (m) => { logs.push(`[${label}][${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => { errors.push(`[${label}][pageerror] ${String(e)}`); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__wanderDebug && window.__wanderDebug.youId, { timeout: 20000 });

    const before = await page.evaluate(() => ({ x: window.__wanderDebug.renderX, y: window.__wanderDebug.renderY }));
    // Test each cardinal direction for ~0.5s
    const dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const moves = {};
    for (const [key, [dx, dy]] of Object.entries(dirs)) {
      await page.keyboard.down(key);
      await new Promise((r) => setTimeout(r, 500));
      await page.keyboard.up(key);
      await new Promise((r) => setTimeout(r, 150));
      const after = await page.evaluate(() => ({ x: window.__wanderDebug.renderX, y: window.__wanderDebug.renderY }));
      moves[key] = { from: before, to: after, dx: after.x - before.x, dy: after.y - before.y };
      // reset before for next dir using current pos
      before.x = after.x; before.y = after.y;
    }
    console.log(`\n=== ${label} (${url}) ===`);
    console.log('moves:', JSON.stringify(moves));
    return moves;
  } catch (e) {
    console.log(`\n=== ${label} FAILED: ${String(e)} ===`);
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await launch();
  try {
    await testUrl(browser, 'http://localhost:4321/wander?devUserId=movdiag', 'DEV_USER');
    await testUrl(browser, 'http://localhost:4321/wander', 'PUBLIC');
  } finally {
    await browser.close();
  }
  console.log('\n========== ALL CONSOLE LOGS ==========');
  console.log(logs.join('\n') || '(none)');
  console.log('\n========== ALL ERRORS ==========');
  console.log(errors.join('\n') || '(none)');
})();
