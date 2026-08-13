// tmp-realperf.mjs — 真实 GPU 下测 draw() 高压力耗时 + 主线程阻塞
// 用法：对比「无优化前/后」——这里只测当前代码在 60 实体压力下的每帧渲染成本。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8105;
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
async function main() {
  const srv = await startStaticServer();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
    await page.evaluate(() => { if (typeof startLocalGame === 'function') startLocalGame(); });
    for (let i = 0; i < 50; i++) {
      const ok = await page.evaluate(() => !!window.__game && window.__game.lastSnapshot && window.__game.localRender);
      if (ok) break;
      await sleep(100);
    }
    await sleep(500);
    // 压 60 个实体（模拟中后期割草战场）+ 关闭 hit-stop
    await page.evaluate(() => {
      const g = window.__game;
      const base = g.lastSnapshot;
      const me = base.entities.find(e => e.kind === 0 && e.id === g.localEntityId) || base.entities[0];
      const cx = me.pos.x, cy = me.pos.y;
      const fakes = [];
      for (let i = 0; i < 60; i++) {
        fakes.push({
          id: 800000 + i, kind: i % 2, pos: { x: cx + (i % 10 - 5) * 40, y: cy + Math.floor(i / 10) * 40 },
          dir: 0, hp: 20, maxHp: 30, status: 1, statusEffects: [], enemyTypeId: i % 3 === 0 ? 'elite_warden' : 'grunt_swarm',
          moving: true,
        });
      }
      g.lastSnapshot = { ...base, entities: [...base.entities, ...fakes] };
    });
    await sleep(200);
    // 测 draw() 同步耗时（60 次平均）
    const cost = await page.evaluate(() => {
      const N = 60; let total = 0;
      for (let i = 0; i < N; i++) { const t0 = performance.now(); draw(); total += performance.now() - t0; }
      return total / N;
    });
    const info = await page.evaluate(() => ({
      canvasW: document.getElementById('game').width,
      canvasH: document.getElementById('game').height,
      viewW: window.VIEW_W, viewH: window.VIEW_H, renderScale: window.renderScale,
      entities: window.__game.lastSnapshot.entities.length,
    }));
    console.log('1920x1080:', JSON.stringify(info), `drawAvgMs=${cost.toFixed(2)}`);
    console.log('errors:', errors.length ? errors : '无');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });