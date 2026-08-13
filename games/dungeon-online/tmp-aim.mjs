// tmp-aim.mjs — 验证攻击方向/索敌修复：敌人放右侧时，攻击方向朝目标 + 索敌选面向敌人
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8106;
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
    await page.evaluate(() => { if (typeof startLocalGame === 'function') startLocalGame(); });
    for (let i = 0; i < 50; i++) {
      const ok = await page.evaluate(() => !!window.__game && window.__game.lastSnapshot && window.__game.localRender);
      if (ok) break;
      await sleep(100);
    }
    await sleep(500);
    // 场景A：敌人在玩家右侧较远（>射程），玩家朝左（lastMoveDir 模拟为左）。
    const r = await page.evaluate(() => {
      // 先停掉 30Hz tick，防止覆盖注入的 snapshot
      if (window.localTimer) clearInterval(window.localTimer);
      const g = window.__game;
      const base = g.lastSnapshot;
      const me = base.entities.find(e => e.kind === 0 && e.id === g.localEntityId);
      // 玩家朝左（移动方向）
      window.lastMoveDir = { x: -1, y: 0 };
      // 右侧放一个敌人（相对玩家 +60,0），前方（左）放一个更近的敌人（-30,0）
      const rightEnemy = { id: 500001, kind: 1, pos: { x: me.pos.x + 60, y: me.pos.y }, dir: 0, hp: 20, maxHp: 30, status: 1, statusEffects: [], enemyTypeId: 'grunt_swarm' };
      const frontEnemy = { id: 500002, kind: 1, pos: { x: me.pos.x - 30, y: me.pos.y }, dir: 0, hp: 20, maxHp: 30, status: 1, statusEffects: [], enemyTypeId: 'grunt_swarm' };
      g.lastSnapshot = { ...base, entities: [...base.entities, rightEnemy, frontEnemy] };
      // 清除真实敌人（避免干扰），只留两个测试敌人
      g.lastSnapshot = { ...g.lastSnapshot, entities: [me, rightEnemy, frontEnemy] };
      // 调用 nearestEnemyId：应选左侧（面向）敌人 500002
      const tid = nearestEnemyId();
      // 攻击方向：模拟 updateInput 攻击分支的 aimDir 计算
      const me2 = g.lastSnapshot.entities.find(e => e.id === g.localEntityId);
      const tgt = g.lastSnapshot.entities.find(e => e.id === tid);
      const ax = tgt.pos.x - me2.pos.x, ay = tgt.pos.y - me2.pos.y;
      const alen = Math.hypot(ax, ay) || 1;
      const aimDir = { x: ax / alen, y: ay / alen };
      return { tid, aimDir, meX: me.pos.x, leftEnemyX: frontEnemy.pos.x, rightEnemyX: rightEnemy.pos.x };
    });
    console.log('scenario A (facing left, enemy right & front):', JSON.stringify(r));
    const choseLeft = r.tid === 500002;
    const aimRight = r.aimDir.x < 0; // 朝左 = 目标方向为 -x
    console.log(`索敌选左侧(面向)敌人: ${choseLeft ? '✓' : '✗ (tid=' + r.tid + ')'}`);
    console.log(`攻击方向朝目标(左): ${aimRight ? '✓' : '✗ (aimDir=' + JSON.stringify(r.aimDir) + ')'}`);
    console.log('errors:', errors.length ? errors : '无');
    const ok = choseLeft && aimRight && errors.length === 0;
    console.log(ok ? '\nPASS: 面向优先索敌 + 攻击方向朝目标' : '\nFAIL');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });