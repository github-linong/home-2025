// tmp-p2-e2e.mjs — 验证 P2：本地单机启动 + meta 升级面板渲染 + 无报错
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8110;
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
    // 关 onboarding
    await page.evaluate(() => {
      if (typeof hideOnboard === 'function') hideOnboard();
      const ob = document.getElementById('onboard'); if (ob) ob.classList.remove('show');
      window.uiPaused = false;
    });
    await sleep(300);
    const r = await page.evaluate(() => {
      const g = window.__game;
      return {
        gameState: g && g.gameState,
        hp: document.getElementById('hp') ? document.getElementById('hp').textContent : '?',
        entities: g && g.lastSnapshot ? g.lastSnapshot.entities.length : 0,
      };
    });
    console.log('state:', JSON.stringify(r));
    // 触发结算面板（模拟通关）验证 meta 升级 UI
    const metaUI = await page.evaluate(() => {
      // 直接调用 showSettle 验证 meta UI 渲染
      if (typeof showSettle === 'function') {
        showSettle(3, 42, 1); // 3层, 42杀, 1倒
        const el = document.getElementById('s-ember-earn');
        const btn = document.getElementById('m-dmg');
        return {
          earn: el ? el.textContent : '?',
          balance: document.getElementById('s-ember-balance') ? document.getElementById('s-ember-balance').textContent : '?',
          dmgBtn: btn ? btn.textContent : '?',
          settleShown: document.getElementById('settle').classList.contains('show'),
        };
      }
      return { err: 'no showSettle' };
    });
    console.log('meta UI:', JSON.stringify(metaUI));
    // 点击购买 dmg 升级
    const buyResult = await page.evaluate(() => {
      const btn = document.getElementById('m-dmg');
      if (btn && !btn.classList.contains('disabled')) { btn.click(); return 'clicked'; }
      return 'disabled or no btn: ' + (btn ? btn.className : 'none');
    });
    await sleep(200);
    const afterBuy = await page.evaluate(() => ({
      balance: document.getElementById('s-ember-balance').textContent,
      dmgBtn: document.getElementById('m-dmg').textContent,
    }));
    console.log('buy:', buyResult, '→', JSON.stringify(afterBuy));
    const ok = r.gameState === 'playing' && metaUI.earn === '42' && metaUI.settleShown && errors.length === 0;
    console.log('\n=== 结果 ===');
    console.log(`本地单机启动: ${r.gameState === 'playing' ? '✓' : '✗'}`);
    console.log(`结算灰烬: ${metaUI.earn === '42' ? '✓ 42🔥' : '✗ (' + metaUI.earn + ')'}`);
    console.log(`meta 升级面板渲染: ${metaUI.dmgBtn && metaUI.dmgBtn.includes('Lv') ? '✓' : '✗'}`);
    console.log(`page errors: ${errors.length ? errors : '无'}`);
    console.log(ok ? '\nPASS: P2 meta 进程 + 升级面板正常' : '\nFAIL');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });