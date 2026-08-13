// tmp-largescreen.cjs — 临时验证「大屏渲染分辨率封顶」性能（用完删除）
// 对比 1024×700 vs 2560×1440 视口：canvas 内部分辨率 / 实际 FPS / 每帧耗时。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function measure(browser, w, h) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
  // 直接进本地单机模式
  await page.evaluate(() => { if (typeof startLocalGame === 'function') startLocalGame(); });
  // 等世界启动、实体刷出来
  for (let i = 0; i < 50; i++) {
    const ok = await page.evaluate(() => window.__game && window.__game.localRender && (window.__game.lastSnapshot?.entities || []).length > 0);
    if (ok) break;
    await sleep(100);
  }
  await sleep(1500); // 让怪物/粒子积累，模拟真实对战压力
  // 注入 FPS 采样器
  const base = await page.evaluate(() => ({
    innerW: window.innerWidth, innerH: window.innerHeight,
    canvasW: document.getElementById('game').width,
    canvasH: document.getElementById('game').height,
    renderScale: window.renderScale,
    VIEW_W: window.VIEW_W, VIEW_H: window.VIEW_H,
    entities: (window.__game.lastSnapshot?.entities || []).length,
  }));
  const perf = await page.evaluate(() => new Promise((res) => {
    let frames = 0, t0 = performance.now();
    const loop = () => {
      frames++;
      if (performance.now() - t0 >= 3000) { res({ fps: frames / 3, frames }); return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }));
  const ent = await page.evaluate(() => (window.__game.lastSnapshot?.entities || []).length);
  // 高压力对照（同一 JS 任务内完成，避免 30Hz tick 覆盖快照）：
  // 塞 100 个假实体 + 30 组粒子 → 同一实体集下分别测「封顶(1600×900)」与「未封顶(全窗口)」的同步渲染耗时。
  const cost = await page.evaluate(() => {
    const g = window.__game;
    const base = g.lastSnapshot;
    const me = (base.entities || []).find((e) => e.id === g.localEntityId) || (base.entities || [])[0];
    const cx = me ? me.pos.x : 0, cy = me ? me.pos.y : 0;
    const fakes = [];
    for (let i = 0; i < 100; i++) {
      fakes.push({
        id: 900000 + i, kind: i % 2, pos: { x: cx + (i % 12 - 6) * 40, y: cy + Math.floor(i / 12) * 40 },
        dir: 0, hp: 20, maxHp: 30, status: 1, statusEffects: [], enemyTypeId: 'grunt_swarm',
      });
    }
    g.lastSnapshot = { ...base, entities: [...(base.entities || []), ...fakes] };
    for (let i = 0; i < 30; i++) g.spawnBurst(cx, cy, '#f86', 12);
    const N = 30;
    const timed = () => {
      let total = 0;
      for (let i = 0; i < N; i++) { const t0 = performance.now(); draw(); total += performance.now() - t0; }
      return total / N;
    };
    const capped = timed();
    const c = document.getElementById('game');
    c.width = window.innerWidth; c.height = window.innerHeight;
    const uncapped = timed();
    return { cappedMs: +capped.toFixed(2), uncappedMs: +uncapped.toFixed(2), ent: g.lastSnapshot.entities.length };
  });
  if (w >= 2000) {
    // 关 onboarding + 塞假实体 + 强制一帧渲染
    const diag = await page.evaluate(() => {
      const r = {};
      try { if (typeof startLocalGame === 'function') { startLocalGame(); r.startCalled = true; } else { r.startCalled = false; } } catch (e) { r.startErr = String(e.message); }
      r.hasLS = !!window.__LocalSim;
      return r;
    });
    await sleep(200);
    const stateInfo = await page.evaluate(() => ({
      state: window.state, localSimMode: window.localSimMode,
      lobbyDisp: document.getElementById('lobby')?.style.display,
      gameState: window.__game?.gameState,
      entCount: window.__game?.lastSnapshot?.entities?.length || 0,
    }));
    console.log('  diag (large):', JSON.stringify({ ...diag, ...stateInfo }));
    await page.evaluate(() => {
      if (typeof hideOnboard === 'function') hideOnboard();
      document.getElementById('onboard')?.classList.remove('show');
      document.getElementById('lobby') && (document.getElementById('lobby').style.display = 'none');
      window.uiPaused = false;
      const g = window.__game;
      const base = g.lastSnapshot;
      const me = (base.entities || []).find((e) => e.id === g.localEntityId) || (base.entities || [])[0];
      const cx = me ? me.pos.x : 0, cy = me ? me.pos.y : 0;
      const fakes = [];
      for (let i = 0; i < 40; i++) {
        fakes.push({
          id: 800000 + i, kind: i % 2, pos: { x: cx + (i % 10 - 5) * 36, y: cy + Math.floor(i / 10) * 36 },
          dir: 0, hp: 20, maxHp: 30, status: 1, statusEffects: [], enemyTypeId: 'grunt_swarm',
        });
      }
      g.lastSnapshot = { ...base, entities: [...(base.entities || []), ...fakes] };
      for (let i = 0; i < 15; i++) g.spawnBurst(cx, cy, '#f86', 12);
      if (typeof draw === 'function') draw();
    });
    await sleep(300);
    await page.screenshot({ path: path.join(ROOT, 'tmp-verify-large.png') });
  }
  await page.close();
  return { viewport: `${w}x${h}`, ...base, entities: ent, fps: +perf.fps.toFixed(1), drawCostCappedMs: cost.cappedMs, drawCostUncappedMs: cost.uncappedMs, entitiesAtMeasure: cost.ent, errors };
}

async function main() {
  const srv = await startStaticServer();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-dev-shm-usage'],
  });
  try {
    const small = await measure(browser, 1024, 700);
    const large = await measure(browser, 2560, 1440);
    console.log('\n=== SMALL 1024x700 ==='); console.log(JSON.stringify(small, null, 2));
    console.log('\n=== LARGE 2560x1440 ==='); console.log(JSON.stringify(large, null, 2));
    console.log('\n=== 结论 ===');
    console.log(`小屏 fps=${small.fps}, 大屏 fps=${large.fps}`);
    console.log(`大屏 canvas 内部=${large.canvasW}x${large.canvasH} (窗口 ${large.innerW}x${large.innerH}, scale=${large.renderScale})`);
    const ok = large.canvasW <= 1600 && large.canvasH <= 900 && small.errors.length === 0 && large.errors.length === 0;
    console.log(ok ? 'PASS: 大屏内部分辨率已封顶且无报错' : 'FAIL: 见上方数据');
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });
