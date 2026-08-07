import puppeteer from 'puppeteer';

function launch() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://localhost:4321/wander?devUserId=seq', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__wanderDebug && window.__wanderDebug.youId, { timeout: 20000 });

  const snap = async (tag) => {
    const d = await page.evaluate(() => {
      const w = window.__wanderDebug;
      // also pull localTarget + render via a debug hook if present
      return { rx: w.renderX, ry: w.renderY, tx: w.targetX, ty: w.targetY, facing: w.facing };
    });
    console.log(tag, JSON.stringify(d));
    return d;
  };

  const hold = async (key, ms) => { await page.keyboard.down(key); await new Promise(r=>setTimeout(r,ms)); await page.keyboard.up(key); await new Promise(r=>setTimeout(r,250)); };

  await snap('start    ');
  await hold('ArrowRight', 600); await snap('after R  ');
  await hold('ArrowLeft', 600);  await snap('after L  ');
  await hold('ArrowDown', 600);  await snap('after D  ');
  await hold('ArrowUp', 600);    await snap('after U  ');

  console.log('errs:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
})();
