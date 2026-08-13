// tmp-skill-e2e.mjs — 验证 solo 本地模式技能自保 + 技能栏用途提示条（用完删除）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT_DIR = path.join(ROOT, 'apps/web-client');
const CLIENT_PORT = 8103;
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
    page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(`http://localhost:${CLIENT_PORT}/index.html?server=ws://localhost:3999`, { waitUntil: 'load' });
    await page.evaluate(() => { if (typeof startLocalGame === 'function') startLocalGame(); });
    for (let i = 0; i < 50; i++) {
      const ok = await page.evaluate(() => !!window.__game && window.__game.lastSnapshot && window.__game.localRender);
      if (ok) break;
      await sleep(100);
    }
    await sleep(600);

    // 1) 检查技能栏渲染（用途提示条 + 图标角标）
    const ui = await page.evaluate(() => ({
      hints: Array.from(document.querySelectorAll('#skill-hints .skill-hint')).map((e) => e.textContent),
      skillCount: document.querySelectorAll('#skillbar .skill').length,
      hasFx: !!document.querySelector('#skillbar .skill .fx'),
      hasCdn: !!document.querySelector('#skillbar .skill .cdnum'),
      mySkills: window.__game.classSkills,
    }));
    console.log('UI:', JSON.stringify(ui));

    // 2) solo 护盾自保：本地 tank 技能 bar = [TAUNT(2), SHIELD_ALLY(0)]
    //    sk1（下标1）= 护盾链接 → 按 2 键施放，检查玩家 shieldUntilTick > 0
    //    先等冷却清零（初始冷却应该是 0）
    const before = await page.evaluate(() => {
      const w = window.__game;
      const me = w.lastSnapshot.entities.find(e => e.kind === 0 && e.id === w.localEntityId);
      return { shield: me.shieldUntilTick ?? 0, classId: me.classId };
    });
    console.log('before shield:', before);

    // 清冷却后按技能键 2（护盾）。优先用 page.keyboard.press（真实 CDP 键盘），
    // 若未生效再退化为直接调用 castSkill(1) 验证 sim 层逻辑。
    await page.evaluate(() => { if (window.__game.clearSkillCd) window.__game.clearSkillCd(); });
    await page.keyboard.press('Digit2');
    await sleep(300);
    await page.keyboard.up('Digit2');
    await sleep(400);
    const after = await page.evaluate(() => {
      const w = window.__game;
      const me = w.lastSnapshot.entities.find(e => e.kind === 0 && e.id === w.localEntityId);
      return { shield: me.shieldUntilTick ?? 0, shieldReduction: me.shieldReduction ?? 0 };
    });
    console.log('after shield (keyboard):', after);
    // 若键盘没生效，直接调 castSkill(1) 隔离验证 sim 层 solo self-cast
    let shieldApplied = (after.shield > before.shield) && after.shieldReduction === 0.5;
    if (!shieldApplied) {
      await page.evaluate(() => { if (window.__game.clearSkillCd) window.__game.clearSkillCd(); });
      const direct = await page.evaluate(() => {
        if (typeof castSkill === 'function') { try { castSkill(1); return { called: true, err: null }; } catch (e) { return { called: true, err: String(e.message) }; } }
        return { called: false, err: 'no castSkill' };
      });
      console.log('direct castSkill(1):', direct);
      await sleep(400);
      const after2 = await page.evaluate(() => {
        const w = window.__game;
        const me = w.lastSnapshot.entities.find(e => e.kind === 0 && e.id === w.localEntityId);
        return { shield: me.shieldUntilTick ?? 0, shieldReduction: me.shieldReduction ?? 0 };
      });
      console.log('after2 shield (direct):', after2);
      shieldApplied = (after2.shield > before.shield) && after2.shieldReduction === 0.5;
    }
    console.log(`\n=== 结果 ===`);
    console.log(`技能提示条: ${ui.hints.length} 条 → ${JSON.stringify(ui.hints)}`);
    console.log(`技能图标角标: ${ui.hasFx ? '有' : '无'}, 冷却秒数: ${ui.hasCdn ? '有' : '无'}`);
    console.log(`solo 护盾自保: ${shieldApplied ? '✓ 生效 (shieldUntilTick 0→' + after.shield + ', 减伤 ' + after.shieldReduction + ')' : '✗ 未生效'}`);
    console.log(`errors: ${errors.length ? errors : '无'}`);
    const ok = ui.hints.length >= 2 && ui.hasFx && ui.hasCdn && shieldApplied && errors.length === 0;
    console.log(ok ? 'PASS: 技能 UI + solo 护盾自保均正常' : 'FAIL');
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch((e) => { console.error(e); process.exit(2); });