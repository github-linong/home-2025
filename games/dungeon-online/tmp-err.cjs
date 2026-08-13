// 抓本地模式下的 console 错误 + page 错误（非 headless 控制台）
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto('http://localhost:4321/games/dungeon/index.html?solo=1&server=ws://127.0.0.1:1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => document.getElementById('btn-local')?.click());
  await new Promise(r => setTimeout(r, 2500));
  console.log('--- done, waiting done ---');
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
