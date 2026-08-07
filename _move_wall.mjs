import puppeteer from 'puppeteer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const launch = () => puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('http://localhost:4321/wander?devUserId=wall', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__wanderDebug && window.__wanderDebug.youId, { timeout: 20000 });
  const sample = () => page.evaluate(() => {
    const w = window.__wanderDebug;
    return { rx: w.renderX, ry: w.renderY, tx: w.targetX, ty: w.targetY, sx: w.serverX, sy: w.serverY, ww: w.worldW, wh: w.worldH, vx: w.velX };
  });

  const s0 = await sample();
  console.log('start', JSON.stringify(s0));
  const dist = s0.ww - 1 - s0.rx;
  const holdMs = Math.min(60000, (dist / 12.78) * 1000 + 6000);
  console.log(`walk right ${dist.toFixed(1)} cells, holding ~${Math.round(holdMs)}ms`);

  await page.keyboard.down('ArrowRight');
  let maxDiv = 0, maxRx = s0.rx, lastInc = Date.now(), atWall = false;
  const t0 = Date.now();
  while (Date.now() - t0 < holdMs) {
    const s = await sample();
    maxRx = Math.max(maxRx, s.rx);
    const div = Math.abs((s.tx ?? s.rx) - (s.sx ?? s.rx));
    maxDiv = Math.max(maxDiv, div);
    if (s.rx > maxRx - 1e-6) lastInc = Date.now();
    if (Date.now() - lastInc > 600) { atWall = true; break; }
    await sleep(60);
  }
  await page.keyboard.up('ArrowRight');
  const afterWall = await sample();
  console.log('at wall?', atWall, 'maxRx=', maxRx.toFixed(2), 'targetAtWall=', afterWall.tx, 'serverAtWall=', afterWall.sx, 'max|target-server|=', maxDiv.toFixed(2));

  // watch for backward run after release
  const rel = [];
  for (let i = 0; i < 30; i++) { rel.push(await sample()); await sleep(60); }
  const wallRx = maxRx;
  const minRxAfter = Math.min(...rel.map((s) => s.rx));
  const decreased = rel.some((s) => s.rx < wallRx - 0.05);
  console.log('after release: minRx=', minRxAfter.toFixed(2), 'wallRx=', wallRx.toFixed(2), 'BACKWARD RUN?', decreased);
  if (decreased) {
    for (const s of rel) console.log(`  rx=${s.rx.toFixed(3)} tx=${s.tx} sx=${s.sx} vx=${s.vx}`);
  }
  console.log('errs:', errs.length ? errs.join(' | ') : 'none');
  await browser.close();
})();
