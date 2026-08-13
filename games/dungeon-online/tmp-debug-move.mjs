// tmp-debug-move.mjs — 检查 sendInput / tickLocal / step 是否真的让 player 移动
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8102;
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
    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
    await page.evaluate(() => { if (typeof startLocalGame === 'function') startLocalGame(); });
    for (let i = 0; i < 50; i++) {
      const ok = await page.evaluate(() => !!window.__game && window.__game.lastSnapshot && window.__game.localRender);
      if (ok) break;
      await sleep(100);
    }
    await sleep(500);
    // 直接在 sim-core 上检查 player + 直接调用 step 验证
    const before = await page.evaluate(() => {
      const w = window.localWorld;
      if (!w) return { noWorld: true };
      const snap = w.snapshot();
      const me = snap.entities.find(e => e.kind === 0);
      return { hasWorld: true, meX: me?.pos.x, meY: me?.pos.y, tick: snap.tick, entities: snap.entities.length };
    });
    console.log('before:', before);
    // 按 D 后等 1 秒，看 sim-core 是否动了
    await page.keyboard.down('KeyD');
    await sleep(1000);
    const after = await page.evaluate(() => {
      const w = window.localWorld;
      const snap = w.snapshot();
      const me = snap.entities.find(e => e.kind === 0);
      return { meX: me?.pos.x, meY: me?.pos.y, tick: snap.tick };
    });
    console.log('after 1s holding D:', after);
    // 直接手 enqueueInput + step，绕过 30Hz 节流，看 sim-core 是否响应
    const direct = await page.evaluate(() => {
      const w = window.localWorld;
      const ok1 = w.enqueueInput(0, { seq: window.localSeq++, tick: w.snapshot().tick, action: 0, dir: { x: 1, y: 0 }, target: 0, param: 0 });
      // step 5 次
      for (let i = 0; i < 5; i++) w.step();
      const snap = w.snapshot();
      const me = snap.entities.find(e => e.kind === 0);
      return { enqOk: ok1, meX: me?.pos.x, meY: me?.pos.y, tick: snap.tick };
    });
    console.log('after direct enqueue+5step:', direct);
    await page.keyboard.up('KeyD');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });