import puppeteer from 'puppeteer';

const URL = 'http://localhost:4321/wander?devUserId=fxdiag';
const BENIGN = /Failed to load resource|chat|\/ws\/chat|net::ERR|WebSocket/i;

const jsErrors = [];

function launch() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' && !BENIGN.test(m.text())) jsErrors.push('console: ' + m.text());
    });
    page.on('pageerror', (e) => {
      if (!BENIGN.test(String(e))) jsErrors.push('pageerror: ' + String(e));
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // wait for join: __wanderDebug.youId set
    await page.waitForFunction(
      () => {
        const d = window.__wanderDebug;
        return d && d.youId && d.facing !== undefined;
      },
      { timeout: 20000 }
    );

    const before = await page.evaluate(() => {
      const d = window.__wanderDebug;
      return { facing: d.facing, tx: d.targetX, ty: d.targetY, rx: d.renderX, ry: d.renderY };
    });

    // Hold two keys simultaneously → expect combined "up-right"
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowUp');

    // let it glide diagonally for ~1.2s
    await new Promise((r) => setTimeout(r, 1200));

    const during = await page.evaluate(() => {
      const d = window.__wanderDebug;
      return { facing: d.facing, tx: d.targetX, ty: d.targetY, rx: d.renderX, ry: d.renderY };
    });

    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');

    // Release and let it settle. Correct behavior: the avatar keeps facing its
    // last direction (does NOT reset to null), but it must STOP gliding — the
    // local target should stabilize.
    const settle1 = await page.evaluate(() => {
      const d = window.__wanderDebug;
      return { facing: d.facing, tx: d.targetX, ty: d.targetY };
    });
    await new Promise((r) => setTimeout(r, 500));
    const settle2 = await page.evaluate(() => {
      const d = window.__wanderDebug;
      return { facing: d.facing, tx: d.targetX, ty: d.targetY };
    });

    const diagOk = during.facing === 'up-right';
    const moved = during.tx !== before.tx || during.ty !== before.ty ||
                  during.rx !== before.rx || during.ry !== before.ry;
    const stopped = settle1.tx === settle2.tx && settle1.ty === settle2.ty;
    const retainedFacing = settle2.facing === 'up-right';

    console.log('DIAG_BEFORE', JSON.stringify(before));
    console.log('DIAG_DURING', JSON.stringify(during));
    console.log('DIAG_SETTLE1', JSON.stringify(settle1));
    console.log('DIAG_SETTLE2', JSON.stringify(settle2));
    console.log('DIAG_FACING_OK', diagOk);
    console.log('DIAG_MOVED', moved);
    console.log('DIAG_STOPPED_OK', stopped);
    console.log('DIAG_RETAINED_FACING_OK', retainedFacing);
    console.log('JS_ERRORS', jsErrors.length ? JSON.stringify(jsErrors) : 'none');

    const pass = diagOk && moved && stopped && retainedFacing && jsErrors.length === 0;
    console.log(pass ? 'DIAG_SMOKE_PASS' : 'DIAG_SMOKE_FAIL');
    process.exit(pass ? 0 : 1);
  } catch (err) {
    console.log('DIAG_SMOKE_FAIL', String(err));
    console.log('JS_ERRORS', jsErrors.length ? JSON.stringify(jsErrors) : 'none');
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
