// preview-e2e.mjs — Cocos 预览端到端冒烟测试（驱动 __ppk / __local 测试钩子）
// 运行：node preview-e2e.mjs   （依赖本目录 node_modules 里的 playwright；截图输出 preview-shots/）
import { chromium } from 'playwright';
import fs from 'node:fs';

const PREVIEW_URL = process.env.PREVIEW_URL || 'http://localhost:7456/';
const OUT = new URL('./preview-shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, expr, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const v = await page.evaluate(expr);
      if (v) return v;
    } catch { /* not ready */ }
    await sleep(500);
  }
  throw new Error(`waitFor 超时: ${expr}`);
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

const steps = [];
async function shot(name) {
  await page.screenshot({ path: `${OUT}${name}.png` });
  steps.push(name);
  console.log(`📸 ${name}`);
}

try {
  await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, `!!(window.__ppk && window.__local)`);
  await sleep(1500);
  await shot('01-home');

  // 图鉴：先抽卡造一点收藏，再进图鉴
  await page.evaluate(`__local.reset(); const r = __local.draw(); r;`);
  await sleep(500);
  await page.evaluate(`__ppk.showScreen('collection')`);
  await sleep(800);
  await shot('02-collection');

  // 点第一张已拥有的卡 → 详情弹窗（lore）
  await page.evaluate(`
    (() => {
      const scr = __ppk.screenNode;
      const cards = [];
      scr.walk && scr.walk(()=>{});
      const findCards = (n, acc) => { n.children && n.children.forEach(c => { if (c.name === 'RarityCard') acc.push(c); findCards(c, acc); }); return acc; };
      const list = findCards(scr, []);
      const btn = list[0] && list[0].getComponent(cc.Button);
      if (btn) btn.node.emit('click');
      return list.length;
    })()
  `);
  await sleep(600);
  await shot('03-card-detail');

  // 关掉弹窗：点击 OK 按钮（详情弹窗里的 Button 文本为「好哒」）
  await page.evaluate(`
    (() => {
      const scr = __ppk.screenNode;
      const findBtns = (n, acc) => { n.children && n.children.forEach(c => { if (c.name === 'Button') acc.push(c); findBtns(c, acc); }); return acc; };
      const btns = findBtns(scr, []);
      const ok = btns[btns.length - 1];
      if (ok) ok.emit('click');
      return btns.length;
    })()
  `);
  await sleep(400);

  // 抽卡屏
  await page.evaluate(`__ppk.showScreen('gacha')`);
  await sleep(600);
  await shot('04-gacha');

  // 拼图屏 + 自动完成
  await page.evaluate(`
    (() => {
      const lvl = __ppk.cfg.levels[0];
      __ppk.showScreen('puzzle', lvl);
      return lvl.id;
    })()
  `);
  await sleep(1200);
  await shot('05-puzzle');
  await page.evaluate(`(() => { const t = __ppk.screenNode; let target = null; const walk = (n) => { if (n.__autoSolve) { target = n; return; } n.children && n.children.forEach(walk); }; walk(t); if (target) target.__autoSolve(); return !!target; })()`);
  await sleep(800);
  await shot('06-puzzle-result');

  // 首页
  await page.evaluate(`__ppk.showScreen('home')`);
  await sleep(500);
  await shot('07-home-final');

  console.log('\n✅ 冒烟测试完成，步骤:', steps.join(', '));
  if (errors.length) {
    console.log('\n⚠️ 控制台错误', errors.length, '条:');
    errors.slice(0, 10).forEach((e) => console.log('  -', e));
  } else {
    console.log('🎉 无控制台错误');
  }
} catch (err) {
  console.error('❌ E2E 失败:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
