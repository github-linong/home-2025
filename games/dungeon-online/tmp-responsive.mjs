// tmp-responsive.mjs — 验证本地模式"跟手"：按下输入后 predicted（渲染位置）在多少 ms 内开始移动
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8108;
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
    // 关 onboarding（PAUSE-FIX）
    await page.evaluate(() => {
      if (typeof hideOnboard === 'function') hideOnboard();
      const ob = document.getElementById('onboard'); if (ob) ob.classList.remove('show');
      window.uiPaused = false;
    });
    await sleep(200);
    // 测试：按下 KeyD，每 ~8ms 采样 predicted.x（渲染位置），看它何时开始移动
    const result = await page.evaluate(async () => {
      // 注入按键到 keys（通过 keydown listener）
      const KEY = 'KeyD';
      // 记录初始 predicted
      const base = { x: predicted.x, y: predicted.y };
      // 手动按下（触发 keydown listener → keys.add）
      window.dispatchEvent(new KeyboardEvent('keydown', { code: KEY, key: 'd', bubbles: true }));
      // 高频采样 predicted（每 ~4ms），记录首次移动的时间
      const samples = [];
      const t0 = performance.now();
      let firstMoveMs = -1;
      while (performance.now() - t0 < 120) {
        const now = performance.now();
        const x = predicted.x;
        if (firstMoveMs < 0 && Math.abs(x - base.x) > 0.5) {
          firstMoveMs = now - t0;
        }
        samples.push({ t: Math.round(now - t0), x: Math.round(x) });
        await new Promise(r => setTimeout(r, 4));
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: KEY, key: 'd', bubbles: true }));
      return { base, firstMoveMs, samples };
    });
    console.log('base:', JSON.stringify(result.base));
    console.log('首次移动延迟:', result.firstMoveMs + 'ms');
    console.log('采样前 10:', result.samples.slice(0, 10).map(s => s.x).join(' → '));
    const ok = result.firstMoveMs >= 0 && result.firstMoveMs <= 25 && errors.length === 0;
    console.log(`\n${ok ? 'PASS' : 'FAIL'}: 渲染位置输入后 ${result.firstMoveMs}ms 开始移动（阈值 ≤25ms 即"跟手"）`);
    console.log('errors:', errors.length ? errors : '无');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });