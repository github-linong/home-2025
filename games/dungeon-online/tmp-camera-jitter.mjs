// tmp-camera-jitter.mjs — 验证视角抖动修复：按住 D 后 predicted 与 authPos 是否同步、摄像机轨迹是否平滑
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8100;
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
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
    await page.evaluate(() => { if (typeof startLocalGame === 'function') startLocalGame(); });
    // 等游戏就绪
    for (let i = 0; i < 50; i++) {
      const ok = await page.evaluate(() => !!window.__game && window.__game.lastSnapshot && window.__game.localRender);
      if (ok) break;
      await sleep(100);
    }
    await sleep(500);
    // 按住 D 2 秒
    await page.keyboard.down('KeyD');
    // 每 100ms 采样 predicted 与 authPos + camX/Y
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const s = await page.evaluate(() => ({
            predicted: window.__game.predicted ? { x: window.__game.predicted.x, y: window.__game.predicted.y } : null,
            auth: window.__game.authPos ? { x: window.__game.authPos.x, y: window.__game.authPos.y } : null,
            cam: { x: window.camX || 0, y: window.camY || 0 },
          }));
      samples.push(s);
      await sleep(100);
    }
    await page.keyboard.up('KeyD');
    await page.close();

    // 分析相机轨迹
    console.log(`\n=== 采样 ${samples.length} 次 (按住 D 2秒) ===`);
    const camXs = samples.map(s => s.cam.x);
    const authXs = samples.map(s => (s.auth && s.auth.x) || 0);
    const predXs = samples.map(s => (s.predicted && s.predicted.x) || 0);
    console.log('相机 x 序列:', camXs.map(x => Math.round(x)).join(' → '));
    console.log('auth x 序列:', authXs.map(x => Math.round(x)).join(' → '));
    console.log('predicted x 序列:', predXs.map(x => Math.round(x)).join(' → '));

    // 计算相机轨迹的"回退次数"（如果相机多次往左跳 = 抖动）
    let camReversals = 0;
    for (let i = 1; i < camXs.length; i++) {
      if (i >= 2 && Math.sign(camXs[i] - camXs[i-1]) !== Math.sign(camXs[i-1] - camXs[i-2])) camReversals++;
    }
    // 相机单调向前次数
    let camMonotonicForward = 0;
    for (let i = 1; i < camXs.length; i++) if (camXs[i] >= camXs[i-1]) camMonotonicForward++;

    console.log(`\n相机单调前进: ${camMonotonicForward}/${camXs.length - 1} 次`);
    console.log(`相机反向跳跃: ${camReversals} 次`);
    console.log(`auth 范围: ${authXs[0]} → ${authXs[authXs.length-1]} (位移 ${authXs[authXs.length-1] - authXs[0]})`);
    console.log(`相机范围: ${camXs[0]} → ${camXs[camXs.length-1]} (位移 ${camXs[camXs.length-1] - camXs[0]})`);

    const ok = errors.length === 0 && camReversals <= 1;
    console.log(ok ? '\nPASS: 相机轨迹基本单调、视角不再抖' : '\nFAIL: 见上方抖动数据');
    if (errors.length) console.log('errors:', errors);
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });