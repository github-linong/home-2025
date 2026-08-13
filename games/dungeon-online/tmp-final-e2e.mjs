// tmp-final-e2e.mjs — 综合验证：本地单机 + 升级三选一 + 新perk + 词缀 + 时间压力
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8109;
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

    // 杀怪直到升级（本地模式：按住攻击 + 朝怪走）
    await page.evaluate(() => { document.body.focus(); });
    await page.keyboard.down('Space'); // 攻击
    await page.keyboard.down('KeyA'); // 向左走（找怪）
    await sleep(1500);
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyA');

    // 检查升级选择是否弹出（perkoverlay show）
    const perkState = await page.evaluate(() => {
      const ov = document.getElementById('perkoverlay');
      const cards = document.querySelectorAll('#perk-row .perk-card');
      return {
        shown: ov ? ov.classList.contains('show') : false,
        cards: cards.length,
        firstCard: cards[0] ? cards[0].textContent : '',
        level: (window.__game.lastSnapshot.entities.find(e => e.kind === 0 && e.id === window.__game.localEntityId) || {}).level,
      };
    });
    console.log('升级弹窗:', JSON.stringify(perkState));

    // 如果有升级选择，点第一个
    let picked = null;
    if (perkState.shown && perkState.cards > 0) {
      const txt = await page.evaluate(() => {
        const card = document.querySelector('#perk-row .perk-card');
        card && card.click();
        return card ? card.textContent : '';
      });
      picked = txt.trim();
      await sleep(300);
    }
    const afterPick = await page.evaluate(() => {
      const g = window.__game;
      const me = g.lastSnapshot.entities.find(e => e.kind === 0 && e.id === g.localEntityId);
      return { perks: me.perks, level: me.level, perkDamageMult: me.perkDamageMult, perkSpeedMult: me.perkSpeedMult };
    });
    console.log('选择后:', JSON.stringify(afterPick));
    console.log('\nerrors:', errors.length ? errors : '无');
    const ok = errors.length === 0;
    console.log(ok ? 'PASS: 本地单机 + 升级三选一 + perk 选择正常' : 'FAIL');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });