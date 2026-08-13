// tmp-design-e2e.mjs — 验证 EMBER 设计系统：截图 + 技能余烬灯样式 + 弹窗卡片
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8115;
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
    await page.evaluate(() => {
      if (typeof hideOnboard === 'function') hideOnboard();
      document.getElementById('onboard')?.classList.remove('show');
      // 塞假实体丰富画面
      const g = window.__game;
      const me = (g.lastSnapshot.entities || []).find(e => e.id === g.localEntityId) || (g.lastSnapshot.entities || [])[0];
      const cx = me.pos.x, cy = me.pos.y;
      g.lastSnapshot = { ...g.lastSnapshot, entities: [...(g.lastSnapshot.entities || []),
        { id: 910001, kind: 1, pos: { x: cx + 80, y: cy }, dir: 0, hp: 40, maxHp: 55, status: 1, statusEffects: [], enemyTypeId: 'elite_warden', affix: 'hasted' },
        { id: 910002, kind: 1, pos: { x: cx - 70, y: cy + 40 }, dir: 0, hp: 20, maxHp: 20, status: 1, statusEffects: [], enemyTypeId: 'grunt_swarm' },
      ]};
    });
    await sleep(400);
    // 检查技能栏样式（余烬灯）
    const skillStyles = await page.evaluate(() => {
      const sk = document.getElementById('sk0');
      const cs = getComputedStyle(sk);
      return {
        clipPath: cs.clipPath,
        outline: cs.outlineColor,
        ready: sk.classList.contains('ready'),
        kColor: getComputedStyle(sk.querySelector('.k')).color,
      };
    });
    console.log('技能余烬灯:', JSON.stringify(skillStyles));
    // 触发 perkoverlay 截图（绕过 JS 去重逻辑，直接渲染卡片+显示）
    await page.evaluate(() => {
      if (typeof showPerkOverlay === 'function') {
        showPerkOverlay(['dmg_up', 'spd_up', 'range_up'], 99, 99); // 用新 level 避开去重
      }
      document.getElementById('perkoverlay').classList.add('show'); // 确保显示
    });
    await sleep(200);
    const overlay = await page.evaluate(() => ({
      shown: document.getElementById('perkoverlay').classList.contains('show'),
      cards: document.querySelectorAll('#perkoverlay .perk-card').length,
      title: document.querySelector('#perkoverlay .perk-title')?.textContent,
      cardBorder: getComputedStyle(document.querySelector('#perkoverlay .perk-card')).borderColor,
    }));
    console.log('perkoverlay:', JSON.stringify(overlay));
    await page.screenshot({ path: path.join(ROOT, 'tmp-design.png') });
    await page.evaluate(() => { if (typeof hidePerkOverlay === 'function') hidePerkOverlay(); document.getElementById('perkoverlay').classList.remove('show'); });
    console.log('errors:', errors.length ? errors : '无');
    const ok = skillStyles.clipPath.includes('polygon') && skillStyles.outline && overlay.shown && overlay.cards === 3 && errors.length === 0;
    console.log(ok ? '\nPASS: EMBER 设计系统落地正常' : '\nFAIL');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });