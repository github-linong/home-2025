import puppeteer from 'puppeteer';

function launch() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://localhost:4321/wander?devUserId=prof', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__wanderDebug && window.__wanderDebug.youId, { timeout: 20000 });

  const sample = () => page.evaluate(() => {
    const w = window.__wanderDebug;
    return { rx: w.renderX, ry: w.renderY, tx: w.targetX, ty: w.targetY,
             sx: w.serverX, sy: w.serverY, facing: w.facing,
             ar: w.accelRamp, vx: w.velX, vy: w.velY, spd: w.speed };
  });

  // ---- Test 1: HOLD RIGHT, then RELEASE — fine velocity trace ----
  console.log('=== TEST 1: hold ArrowRight 800ms then release, fine trace ===');
  await page.keyboard.down('ArrowRight');
  await sleep(800);
  await page.keyboard.up('ArrowRight');
  console.log('-- release trace (t ms, rx, tx, vx, ar) --');
  let t0 = Date.now();
  for (let i = 0; i < 26; i++) {
    const s = await sample();
    const dt = Date.now() - t0;
    console.log(`  +${String(dt).padStart(3)}ms rx=${s.rx.toFixed(3)} tx=${s.tx.toFixed(2)} vx=${s.vx.toFixed(2)} ar=${s.ar}`);
    await sleep(16);
  }
  const last = await sample();
  console.log('  settled rx=', last.rx.toFixed(3), 'tx=', last.tx.toFixed(2));

  // ---- Test 2: DIAGONAL hold — speed + angle ----
  console.log('\n=== TEST 2: hold ArrowRight+ArrowDown 1000ms ===');
  await sleep(300);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  const dia = [];
  for (let i = 0; i < 20; i++) { dia.push(await sample()); await sleep(50); }
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowDown');
  await sleep(300);
  const cruise = dia.slice(8); // after accel ramp
  const cx = cruise.reduce((a, s) => a + s.vx, 0) / cruise.length;
  const cy = cruise.reduce((a, s) => a + s.vy, 0) / cruise.length;
  const net = Math.hypot(cx, cy);
  const ratio = cx / (cy || 1e-9);
  console.log('diag cruise avg vx=', cx.toFixed(2), 'vy=', cy.toFixed(2),
              'netSpeed=', net.toFixed(2), 'vx/vy=', ratio.toFixed(3));
  console.log('  => diagonal net speed vs cardinal (should be ~equal by design):', net.toFixed(2));

  await sample();
  console.log('\nerrs:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
})();
