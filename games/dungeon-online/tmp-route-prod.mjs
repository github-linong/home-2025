// tmp-route-prod.mjs — 生产路径验证：推进本地世界到层间，routeoverlay 自然弹出
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8114;
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
    await page.setViewport({ width: 1280, height: 720 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
    await sleep(1200);
    await page.evaluate(() => {
      if (typeof hideOnboard === 'function') hideOnboard();
      document.getElementById('onboard')?.classList.remove('show');
    });
    await sleep(300);
    // 模拟生产：清场推进波次直到 intermission 后 routeoverlay 自然弹出
    const result = await page.evaluate(async () => {
      const g = window.__game;
      // 调用 handleSnapshot 一次让开始
      // 清场所有 wave1 敌人 + 推进 intermission + spawn wave2 → 进 floor2 → floorChoice
      const all = g.lastSnapshot.entities;
      const me = all.find(e => e.id === g.localEntityId);
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      for (let s = 0; s < 400; s++) {
        // 清场（若有敌人）
        const snap = g.lastSnapshot;
        const enemies = snap.entities.filter(e => e.kind === 1 || e.kind === 2);
        for (const e of enemies) {
          try { g.lastSnapshot = { ...snap, entities: snap.entities.map(x => x.id === e.id ? { ...x, hp: 0 } : x) }; } catch {}
        }
        await sleep(40);
        // 检查 floorChoice
        if (g.lastSnapshot.floorChoice && g.lastSnapshot.floorChoice.length > 0) {
          return { foundAt: s, options: g.lastSnapshot.floorChoice };
        }
      }
      return { foundAt: -1 };
    });
    console.log('route production:', JSON.stringify(result));
    // 截图
    await sleep(100);
    const shown = await page.evaluate(() => ({
      shown: document.getElementById('routeoverlay').classList.contains('show'),
      cards: document.querySelectorAll('#route-row .perk-card').length,
    }));
    console.log('UI:', JSON.stringify(shown));
    await page.screenshot({ path: path.join(ROOT, 'tmp-route-prod.png') });
    // 选择第一个（验证 CHOOSE_FLOOR）
    if (shown.shown) {
      await page.evaluate(() => document.querySelector('#route-row .perk-card').click());
      await sleep(500);
      const after = await page.evaluate(() => ({
        shown: document.getElementById('routeoverlay').classList.contains('show'),
        activeRoute: g => g.lastSnapshot.activeRoute || null,
      }));
      console.log('after click:', JSON.stringify(after));
    }
    console.log('errors:', errors.length ? errors : '无');
    const ok = result.foundAt > 0 && shown.shown && errors.length === 0;
    console.log(ok ? '\nPASS: 路线选择生产路径触发' : '\nFAIL');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });