// tmp-offline-e2e.mjs — 验证「前端不支持服务端，加载即进入本地单机」能玩
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8107;
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
    // 关键：不连 server，直接加载页面（?server= 指向不存在端口，验证前端不依赖它）
    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
    // 等本地单机自动启动
    await sleep(1200);
    const r = await page.evaluate(() => {
      const g = window.__game;
      return {
        hasLocalSim: !!window.__LocalSim,
        connected: g ? g.connected : null,
        gameState: g ? g.gameState : null,
        entities: g && g.lastSnapshot ? g.lastSnapshot.entities.length : 0,
        localEntityId: g ? g.localEntityId : null,
        status: document.getElementById('status') ? document.getElementById('status').textContent : '?',
        lobbyDisplay: document.getElementById('lobby') ? getComputedStyle(document.getElementById('lobby')).display : 'no-lobby',
        hudDisplay: document.getElementById('hud') ? getComputedStyle(document.getElementById('hud')).display : '?',
      };
    });
    console.log('state after load:', JSON.stringify(r, null, 2));
    // 等怪物刷出来
    await sleep(2000);
    const after = await page.evaluate(() => ({
      entities: window.__game && window.__game.lastSnapshot ? window.__game.lastSnapshot.entities.length : 0,
      hp: document.getElementById('hp') ? document.getElementById('hp').textContent : '?',
    }));
    console.log('after 2s:', JSON.stringify(after));
    // 先关 onboarding（PAUSE-FIX：引导显示时世界暂停，需关闭后才恢复步进）
    await page.evaluate(() => {
      if (typeof hideOnboard === 'function') hideOnboard();
      const ob = document.getElementById('onboard');
      if (ob) ob.classList.remove('show');
      window.uiPaused = false;
    });
    await sleep(300);
    // 键盘移动测试：先聚焦 body，再 CDP 真实键盘（触发 window keydown）
    await page.evaluate(() => {
      document.body.focus();
    });
    await page.keyboard.down('KeyD');
    await sleep(800);
    const moved = await page.evaluate(() => {
      const g = window.__game;
      const me = g.lastSnapshot.entities.find(e => e.kind === 0 && e.id === g.localEntityId);
      // 也读原始 snapshot 字段 + tick，确认世界在推进
      return {
        x: me ? me.pos.x : null, y: me ? me.pos.y : null,
        tick: g.lastSnapshot.tick,
        playerRaw: me ? { x: me.x, y: me.y, pos: me.pos, dir: me.dir } : null,
      };
    });
    await page.keyboard.up('KeyD');
    console.log('player after move:', JSON.stringify(moved));
    const ok = r.gameState === 'playing' && r.connected === true && r.entities > 0 && r.lobbyDisplay === 'none' && errors.length === 0;
    console.log('\n=== 结果 ===');
    console.log(`本地单机自动启动 (gameState=playing): ${r.gameState === 'playing' ? '✓' : '✗'}`);
    console.log(`状态栏: ${r.status}`);
    console.log(`有本地世界+实体: ${r.entities > 0 ? '✓ (' + r.entities + ')' : '✗'}`);
    console.log(`大厅未显示 (none): ${r.lobbyDisplay === 'none' ? '✓' : '✗'}`);
    console.log(`page errors: ${errors.length ? errors : '无'}`);
    console.log(ok ? '\nPASS: 前端已纯本地单机，不依赖服务端' : '\nFAIL: 见上方');
    await page.screenshot({ path: path.join(ROOT, 'tmp-offline.png') });
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });