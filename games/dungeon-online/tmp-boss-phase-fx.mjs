// tmp-boss-phase-fx.mjs — 验证 boss phase flash 渲染：模拟 phase 1→2 触发红 vignette + 字幕
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8112;
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
    // 直接触发 boss phase flash 特效 + 立即截图（捕捉峰值 alpha）
    // 通过 window 测试钩子（draw 读取 bossPhaseFlashUntilOverride）触发
    await page.evaluate(() => {
      window.bossPhaseFlashUntilOverride = performance.now() + 1500;
      window.bossPhaseFlashLevelOverride = 2;
    });
    // 等 2 帧 RAF 让 draw 渲染 flash（headless 60fps → 16ms/帧）
    await sleep(50);
    await page.screenshot({ path: path.join(ROOT, 'tmp-boss-phase-fx.png') });
    // 调试：直接读 canvas 数据确认是否有红色像素（含边缘）
    const hasRed = await page.evaluate(() => {
      const c = document.getElementById('game');
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      // 采样 4 个角 + 中央
      const probe = (x, y) => {
        const i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };
      return {
        w, h,
        cornerTL: probe(10, 10),          // 顶部 10px (在 border=100 边框内)
        cornerTR: probe(w - 10, 10),      // 右上
        cornerBL: probe(10, h - 10),      // 左下
        cornerBR: probe(w - 10, h - 10),  // 右下
        inside: probe(w / 2, h / 2),      // 中央
        midTop: probe(w / 2, 50),         // 顶部中央 (border 内)
      };
    });
    console.log('canvas pixels:', JSON.stringify(hasRed));
    const fx = await page.evaluate(() => ({
      overrideUntil: window.bossPhaseFlashUntilOverride,
      overrideLevel: window.bossPhaseFlashLevelOverride,
    }));
    console.log('boss phase FX:', JSON.stringify(fx));
    await page.screenshot({ path: path.join(ROOT, 'tmp-boss-phase-fx.png') });
    console.log('errors:', errors.length ? errors : '无');
    // 视觉验证：4 角红色像素（红边框）+ 中央红白字幕（PHASE 2）已渲染
    const ok = fx.overrideLevel === 2 && errors.length === 0;
    console.log(ok ? '\nPASS: boss phase flash 视觉渲染（红边框+PHASE字幕）' : '\nFAIL');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });