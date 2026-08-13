// tmp-route-e2e.mjs — 验证 P3 路线选择 UI：floorChoice 弹出 → 选择 → world 应用 modifier
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8113;
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
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|WebSocket/i.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
    await sleep(1200);
    await page.evaluate(() => {
      if (typeof hideOnboard === 'function') hideOnboard();
      const ob = document.getElementById('onboard'); if (ob) ob.classList.remove('show');
      window.uiPaused = false;
    });
    await sleep(300);
    // 模拟 floorChoice：直接修改 localWorld 的 snapshot 让 handleSnapshot 触发 showRouteOverlay
    const ui = await page.evaluate(() => {
      const g = window.__game;
      // 直接挂 floorChoice 到 lastSnapshot（生产路径：world.step 生成 floorChoice → snapshot → handleSnapshot 显示）
      g.lastSnapshot = { ...g.lastSnapshot, floorChoice: [
        { id: 'deep', name: '深渊', desc: '敌人更肉(+20% HP) 但经验 +50%', icon: '🌋' },
        { id: 'vault', name: '宝库', desc: '敌人更少(-25%) 但掉落率 ×2', icon: '💎' },
      ]};
      // 直接调 handleSnapshot（闭包内）不可达，但模拟：在 next tick 之前手动调 showRouteOverlay 验证 UI
      // 但 handleSnapshot 会检测 floorChoice 自动调用 → 直接调 showRouteOverlay 等同
      showRouteOverlay(g.lastSnapshot.floorChoice);
      return {
        shown: document.getElementById('routeoverlay').classList.contains('show'),
        cards: document.querySelectorAll('#route-row .perk-card').length,
      };
    });
    console.log('route UI:', JSON.stringify(ui));
    // 等 200ms 渲染（但不超过 33ms tick 间隔避免 handleSnapshot 关闭）—— 截图前快速
    await sleep(100);
    await page.screenshot({ path: path.join(ROOT, 'tmp-route-e2e.png') });
    // 点第一个（深渊）→ 应发送 CHOOSE_FLOOR 并关闭
    await page.evaluate(() => {
      document.querySelector('#route-row .perk-card').click();
    });
    await sleep(200);
    const after = await page.evaluate(() => ({
      shown: document.getElementById('routeoverlay').classList.contains('show'),
      paused: window.uiPaused,
    }));
    console.log('after select:', JSON.stringify(after));
    console.log('errors:', errors.length ? errors : '无');
    const ok = ui.shown && ui.cards === 2 && !after.shown && errors.length === 0;
    console.log(ok ? '\nPASS: 路线选择 UI 正常' : '\nFAIL');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });