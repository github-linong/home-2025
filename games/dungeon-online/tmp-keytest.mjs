// tmp-keytest.mjs — 验证键盘事件是否真的传到了游戏
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8101;
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
    page.on('pageerror', (e) => console.log('pageerror:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('console err:', m.text()); });
    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
    await page.evaluate(() => { if (typeof startLocalGame === 'function') startLocalGame(); });
    for (let i = 0; i < 50; i++) {
      const ok = await page.evaluate(() => !!window.__game && window.__game.lastSnapshot && window.__game.localRender);
      if (ok) break;
      await sleep(100);
    }
    await sleep(500);
    // 用 focus + dispatch keydown（更可靠，绕过 puppeteer keyboard 路由）
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', bubbles: true }));
    });
    await sleep(100);
    // 改用 page.keyboard.down + 等更久
    await page.keyboard.down('KeyD');
    const keysAfter = await page.evaluate(() => {
      // 触发一次 currentInputDir 看返回值
      const r = { dir: typeof currentInputDir === 'function' ? currentInputDir() : null, state: window.state };
      return r;
    });
    console.log('after keyboard.down:', JSON.stringify(keysAfter));
    await sleep(1000);
    await sleep(800);
    const sample = await page.evaluate(() => ({
      auth: window.__game.authPos, predicted: window.__game.predicted,
    }));
    console.log('after 1s holding KeyD:', JSON.stringify(sample, null, 2));
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });