// verify-client.mjs — 真浏览器验证 web-client（C2 type 路由 / 丝滑 / 协作技 / 无报错 / 截图）
// 自包含：起独立 dungeon-server + 静态客户端服务 + puppeteer 驱动 Chrome。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // games/dungeon-online
const NODE = '/Users/lnmacmini/.workbuddy/binaries/node/versions/22.22.2/bin/node';
const SERVER_PORT = 3019;
const CLIENT_PORT = 8090;
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

function startStaticServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = (req.url || '/').split('?')[0];
      if (p === '/' || p === '') p = '/index.html';
      const fp = path.join(CLIENT_DIR, p);
      fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        const ext = path.extname(fp);
        const ct = ext === '.html' ? 'text/html' : ext === '.png' ? 'image/png' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        res.end(data);
      });
    });
    srv.listen(CLIENT_PORT, () => resolve(srv));
  });
}

const procs = [];
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch {} }
}

async function main() {
  const staticSrv = await startStaticServer();
  procs.push(staticSrv);
  const srv = spawn(NODE, ['--experimental-strip-types', path.join(ROOT, 'apps/dungeon-server/src/server.ts')], {
    env: { ...process.env, DEV_SKIP_AUTH: 'true', PORT: String(SERVER_PORT) },
    stdio: 'ignore',
  });
  procs.push(srv);
  await sleep(3000); // let ws server boot

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--disable-dev-shm-usage'],
  });
  procs.push({ kill: () => browser.close().catch(() => {}) });

  const results = {};
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 700 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:${SERVER_PORT}`, { waitUntil: 'load' });

    // wait for connection
    let connected = false;
    for (let i = 0; i < 60; i++) {
      connected = await page.evaluate(() => !!window.__game && window.__game.connected);
      if (connected) break;
      await sleep(150);
    }
    results.connected = connected;

    // wait until we have a snapshot
    let hasSnap = false;
    for (let i = 0; i < 40; i++) {
      hasSnap = await page.evaluate(() => !!window.__game.lastSnapshot);
      if (hasSnap) break;
      await sleep(150);
    }
    results.snapshotType = await page.evaluate(() => window.__game.lastSnapshot?.type ?? null);

    // ── movement sample (hold Right) ──
    await page.keyboard.down('KeyD');
    const samples = [];
    let lootSeen = false;
    for (let i = 0; i < 35; i++) {
      const p = await page.evaluate(() => window.__game.authPos);
      if (p) samples.push(p);
      const lk = await page.evaluate(() => (window.__game.lastSnapshot?.entities || []).some((e) => e.kind === 6));
      if (lk) lootSeen = true;
      await sleep(100);
    }
    await page.keyboard.up('KeyD');

    // compute net speed + smoothness (CoV of per-sample step)
    let dists = [];
    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i].x - samples[i - 1].x;
      const dy = samples[i].y - samples[i - 1].y;
      dists.push(Math.hypot(dx, dy));
    }
    const mean = dists.reduce((a, b) => a + b, 0) / (dists.length || 1);
    const variance = dists.reduce((a, b) => a + (b - mean) ** 2, 0) / (dists.length || 1);
    const cov = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const netSpeed = mean / 0.1; // px/s (100ms cadence)
    results.netSpeed = Math.round(netSpeed);
    results.smoothCov = +cov.toFixed(3);

    // ── attack + skill (should not throw) ──
    await page.keyboard.press('Space');
    await sleep(200);
    await page.keyboard.press('Digit1'); // co-op skill 0
    await sleep(200);
    await page.keyboard.press('Digit3'); // co-op skill 2
    await sleep(200);
    // wander + attack to try to kill something (loot chance)
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Space');
      const lk = await page.evaluate(() => (window.__game.lastSnapshot?.entities || []).some((e) => e.kind === 6));
      if (lk) lootSeen = true;
      await sleep(140);
    }
    await page.keyboard.up('KeyW');
    results.lootSeen = lootSeen;

    results.errors = errors;
    results.spritesLoaded = await page.evaluate(() => window.__game.spritesLoaded);

    // ── M7 wave-progression contract fields present on wired snapshot ──
    // 验证服务端新增的 wave/totalWaves/roomPhase/enemiesRemaining 已随快照下发到客户端。
    results.waveFields = await page.evaluate(() => {
      const s = window.__game.lastSnapshot;
      if (!s) return null;
      return {
        wave: s.wave, totalWaves: s.totalWaves, roomPhase: s.roomPhase,
        enemiesRemaining: s.enemiesRemaining, intermissionTicks: s.intermissionTicks,
      };
    });
    results.waveGame = await page.evaluate(() => ({
      wave: window.__game.wave, totalWaves: window.__game.totalWaves,
      roomPhase: window.__game.roomPhase, bannerShown: window.__game.bannerShown,
    }));

    await page.screenshot({ path: path.join(CLIENT_DIR, 'assets', 'verify-client.png') });
    log('screenshot → assets/verify-client.png');
  } finally {
    cleanup();
  }

  // ── gates ──
  log('\n=== RESULT ===');
  log(JSON.stringify(results, null, 2));
  const gates = [];
  gates.push(['connected', results.connected === true]);
  gates.push(['snapshot type == "snapshot" (C2)', results.snapshotType === 'snapshot']);
  gates.push(['net speed 150..260 px/s', results.netSpeed >= 150 && results.netSpeed <= 260]);
  gates.push(['smooth CoV < 0.4', results.smoothCov < 0.4]);
  gates.push(['no page/console errors', (results.errors || []).length === 0]);
  gates.push(['sprites loaded', results.spritesLoaded === true]);
  const wf = results.waveFields;
  gates.push(['wave fields on snapshot (M7)', !!wf && typeof wf.wave === 'number' && typeof wf.totalWaves === 'number' && typeof wf.roomPhase === 'number' && typeof wf.enemiesRemaining === 'number']);
  const wg = results.waveGame;
  gates.push(['client parsed wave/totalWaves (M7)', !!wg && typeof wg.wave === 'number' && typeof wg.totalWaves === 'number']);
  let pass = true;
  log('\n=== GATES ===');
  for (const [name, ok] of gates) {
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) pass = false;
  }
  log(`\nloot (kind=6) seen during run: ${results.lootSeen ? 'YES' : 'no (enemies may not have died in window)'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); cleanup(); process.exit(2); });
