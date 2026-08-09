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
    // M8: a co-op cast should surface activeSkill on the local ally snapshot (authoritative).
    // re-fetch a fresh snapshot shortly after the Digit1 cast.
    let anyActive = false;
    for (let i = 0; i < 20; i++) {
      const v = await page.evaluate(() => window.__game.anyActiveSkill === true);
      if (v) { anyActive = true; break; }
      await sleep(80);
    }
    results.coopCastSeen = anyActive;

    // ── M9 downed-ally rescue clarity: make lastSnapshot a getter that ALWAYS appends a
    // synthetic downed ally, so draw() deterministically sees it (server @30Hz would otherwise
    // overwrite between frames). Then poll downedAllies — confirms the new downed render +
    // rescue-arc code path runs without error and counts the ally.
    // ── M12 enrage feedback: the same getter ALSO appends a synthetic ENRAGED brute_charger
    // (enraged:true) so the M12 pulsing-red-ring + 「狂暴」 label code path is exercised and
    // GAME.anyEnraged flips true. (Real brute enrage is hard to reach in the short verify window.) ──
    const downErr = await page.evaluate(() => {
      const g = window.__game;
      const real = g.lastSnapshot;
      if (!real) return 'no-snapshot';
      if (!real.entities.find((e) => e.kind === 0)) return 'no-player';
      let _snap = real;
      Object.defineProperty(g, 'lastSnapshot', {
        configurable: true,
        get() {
          const base = _snap;
          if (!base || !base.entities) return base;
          const me = base.entities.find((e) => e.kind === 0);
          if (!me) return base;
          const fakeDowned = {
            id: 900001, kind: 0, pos: { x: (me.pos?.x || 0) + 20, y: (me.pos?.y || 0) + 20 },
            dir: 0, hp: 1, maxHp: 100, status: 3, statusEffects: [],
            classId: 'healer', ownerId: 99, rescue: { targetId: 900001, progressTicks: 30, totalTicks: 90 },
          };
          const fakeEnraged = {
            id: 900002, kind: 1, enemyTypeId: 'brute_charger', pos: { x: (me.pos?.x || 0) - 30, y: (me.pos?.y || 0) - 30 },
            dir: 0, hp: 20, maxHp: 120, status: 1, statusEffects: [], enraged: true,
          };
          // M13: synthetic bomber with an ACTIVE telegraph → exercises the imminent-detonation
          // cue render path (pulsing danger outline) + AOE_FILL telegraph draw + 『自爆』 label.
          const fakeBomber = {
            id: 900003, kind: 1, enemyTypeId: 'bomber_imp', pos: { x: (me.pos?.x || 0) + 40, y: (me.pos?.y || 0) + 10 },
            dir: 0, hp: 16, maxHp: 18, status: 1, statusEffects: [],
            telegraph: { shape: 1, color: '#ff3b2f', startTick: 0, applyTick: 12, radius: 36, dir: undefined },
          };
          return { ...base, entities: [...base.entities, fakeDowned, fakeEnraged, fakeBomber] };
        },
        set(v) { _snap = v; },
      });
      return null;
    });
    let seen = false, enragedSeen = false, bomberSeen = false;
    for (let i = 0; i < 40; i++) {
      await sleep(15);
      const c = await page.evaluate(() => window.__game.downedAllies);
      if (c >= 1) seen = true;
      const er = await page.evaluate(() => window.__game.anyEnraged === true);
      if (er) enragedSeen = true;
      const bm = await page.evaluate(() => window.__game.bomberCount);
      if (bm >= 1) bomberSeen = true;
      if (seen && enragedSeen && bomberSeen) break;
    }
    results.downedRenderErr = downErr;
    results.downedAlliesSeen = seen;
    results.enragedSeen = enragedSeen;
    results.bomberSeen = bomberSeen;

    // ── M11 death/hit particle juice: trigger spawnBurst via exposed hook, then confirm
    // particleCount rises and drawParticles runs without error (no thrown exceptions in window.onerror). ──
    const burstErr = await page.evaluate(async () => {
      try {
        const g = window.__game;
        if (typeof g.spawnBurst !== 'function') return 'no-hook';
        g.spawnBurst(200, 200, '#f86', 14);
        // wait a couple frames so drawParticles() consumes/advances them (proves no crash)
        await new Promise((res) => setTimeout(res, 60));
        return g.particleCount > 0 ? null : 'no-particles';
      } catch (e) { return String(e && e.message ? e.message : e); }
    });
    results.burstErr = burstErr;
    results.particleSeen = burstErr == null;
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
  gates.push(['co-op cast surfaces activeSkill (M8/C5)', results.coopCastSeen === true]);
  gates.push(['downed-ally render path (M9)', results.downedRenderErr == null && results.downedAlliesSeen === true]);
  gates.push(['enrage feedback renders (M12)', results.enragedSeen === true]);
  gates.push(['bomber variant renders (M13)', results.bomberSeen === true]);
  gates.push(['death/hit particle burst (M11)', results.burstErr == null && results.particleSeen === true]);
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
