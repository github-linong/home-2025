// 模拟 E2E 连接方式：用有效端口连真实 server（自起），抓 console 错误
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const puppeteer = require('puppeteer');
const SERVER_PORT = 3013;

(async () => {
  const srv = spawn(process.env.NODE || 'node', ['--experimental-strip-types', path.join(ROOT, 'apps/dungeon-server/src/server.ts')], {
    env: { ...process.env, DEV_SKIP_AUTH: 'true', PORT: String(SERVER_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 3000));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 700 });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  await page.goto(`http://localhost:4321/games/dungeon/index.html?server=ws://localhost:${SERVER_PORT}&solo=1`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 6000));
  await browser.close();
  srv.kill();
})().catch(e => { console.error('ERR', e); process.exit(1); });
