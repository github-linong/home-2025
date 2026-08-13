// tmp-sim-debug.mjs — 直接操作 localWorld 验证 solo self-cast（绕过 UI 键盘路由）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8104;
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
    // 通过 __LocalSim 直接 createWorld（绕过 UI），手动 enqueueInput+step 验证 solo self-cast
    const r = await page.evaluate(() => {
      const LS = window.__LocalSim;
      if (!LS) return { err: 'no LS' };
      const w = LS.createWorld({ runId: 'x', seed: 'x', biomeId: 0, players: [{ seatId: 0, userId: 'P1', classId: 'tank' }] });
      // 找玩家
      let snap = w.snapshot();
      const me = snap.entities.find(e => e.kind === 0);
      const before = { shield: me.shieldUntilTick ?? 0 };
      // enqueue SHIELD_ALLY skill (action=3, param=0)
      const okEnq = w.enqueueInput(0, { seq: 1, tick: snap.tick, action: 3, dir: { x: 0, y: 0 }, target: 0, param: 0 });
      for (let i = 0; i < 3; i++) w.step();
      snap = w.snapshot();
      const me2 = snap.entities.find(e => e.kind === 0);
      const after = { shield: me2.shieldUntilTick ?? 0, reduction: me2.shieldReduction ?? 0 };
      return { okEnq, before, after, meId: me.id, me2Id: me2.id };
    });
    console.log('direct LS createWorld solo self-cast:', JSON.stringify(r, null, 2));
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });