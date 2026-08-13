// tmp-review.mjs — 全面体验验证：截图 + 检查各 HUD 元素
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8111;
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
    await sleep(1500);
    // 关 onboarding + 注入压力场景（敌人 + 假实体）让画面丰富
    await page.evaluate(() => {
      if (typeof hideOnboard === 'function') hideOnboard();
      const ob = document.getElementById('onboard'); if (ob) ob.classList.remove('show');
      window.uiPaused = false;
      // 塞假实体（含精英+词缀、boss）
      const g = window.__game;
      const base = g.lastSnapshot;
      const me = (base.entities || []).find(e => e.id === g.localEntityId) || (base.entities || [])[0];
      const cx = me.pos.x, cy = me.pos.y;
      const fakes = [
        { id: 900001, kind: 1, pos: { x: cx + 70, y: cy }, dir: 0, hp: 55, maxHp: 55, status: 1, statusEffects: [], enemyTypeId: 'elite_warden', affix: 'hasted' },
        { id: 900002, kind: 1, pos: { x: cx + 40, y: cy + 50 }, dir: 0, hp: 30, maxHp: 30, status: 1, statusEffects: [], enemyTypeId: 'grunt_swarm' },
        { id: 900003, kind: 1, pos: { x: cx - 60, y: cy - 20 }, dir: 0, hp: 20, maxHp: 20, status: 1, statusEffects: [], enemyTypeId: 'bomber_imp' },
        { id: 900004, kind: 2, pos: { x: cx - 150, y: cy - 80 }, dir: 0, hp: 450, maxHp: 450, status: 1, statusEffects: [], enemyTypeId: 'boss_emberlord' },
      ];
      g.lastSnapshot = { ...base, entities: [...(base.entities || []), ...fakes] };
      for (let i = 0; i < 10; i++) g.spawnBurst(cx, cy, '#f86', 15);
    });
    await sleep(300);
    const hud = await page.evaluate(() => ({
      lv: document.getElementById('lv-num') ? document.getElementById('lv-num').textContent : '?',
      xpFill: document.getElementById('lv-xpfill') ? document.getElementById('lv-xpfill').style.width : '?',
      wavechip: document.getElementById('wavechip') ? document.getElementById('wavechip').textContent : '?',
      floorchip: document.getElementById('floorchip') ? document.getElementById('floorchip').textContent : '?',
      skillHints: document.querySelectorAll('#skill-hints .skill-hint').length,
      skillFx: document.querySelectorAll('#skillbar .fx').length,
      bossbar: document.getElementById('bossbar') ? document.getElementById('bossbar').style.display : '?',
    }));
    console.log('HUD:', JSON.stringify(hud));
    await page.screenshot({ path: path.join(ROOT, 'tmp-review.png') });
    await page.close();
    console.log('page errors:', errors.length ? errors : '无');
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });