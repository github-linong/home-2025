const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = '/Users/lnmacmini/Projects/personal-site/apps/web/public';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(8090, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  // 屏蔽外部脚本（public_header 等）不影响主流程
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('public_header') || u.includes('public_footer') || u.includes('bootcss') || u.includes('bootcdn') || u.includes('esm.sh')) return r.abort();
    r.continue();
  });

  await page.goto('http://localhost:8090/demos/html/swagger-to-ts-client.html', { waitUntil: 'networkidle0', timeout: 20000 });
  // 示例已自动加载
  await page.waitForFunction(() => document.getElementById('specInput').value.length > 0, { timeout: 5000 });

  // 点击生成
  await page.click('#genBtn');
  await page.waitForFunction(() => {
    const ft = document.getElementById('fileTree');
    return ft && !ft.hidden && ft.querySelectorAll('button').length > 0;
  }, { timeout: 5000 });

  const fileList = await page.$$eval('#fileTree button', (bs) => bs.map((b) => b.textContent));
  console.log('FILE TREE files:', fileList);
  const dlAllVisible = await page.$eval('#dlAllBtn', (b) => !b.hidden);
  console.log('dlAllBtn visible:', dlAllVisible);

  // 默认选中第一个文件（types.d.ts）的内容应包含 Pet 接口
  const firstContent = await page.$eval('#output', (c) => c.textContent);
  console.log('first file has Pet interface:', firstContent.includes('interface Pet'));
  console.log('first file is types.d.ts:', fileList[0] === 'types.d.ts');

  // 点击 pets.ts
  const petsBtn = await page.$$('#fileTree button');
  // 找到 pets.ts
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#fileTree button')].find((x) => x.textContent === 'pets.ts');
    b && b.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const petsContent = await page.$eval('#output', (c) => c.textContent);
  console.log('pets.ts imports types:', petsContent.includes("from './types'"));
  console.log('pets.ts has request import:', petsContent.includes("from './http'"));
  console.log('pets.ts has getPetById:', petsContent.includes('export async function getPetById'));

  // 点击 index.ts
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#fileTree button')].find((x) => x.textContent === 'index.ts');
    b && b.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const idxContent = await page.$eval('#output', (c) => c.textContent);
  console.log('index.ts barrels types:', idxContent.includes("export * from './types'"));

  // 切到 axios 再生成，检查 pets.ts 用 http
  await page.evaluate(() => { document.querySelector('input[name=client][value=axios]').click(); });
  await page.click('#genBtn');
  await page.waitForFunction(() => {
    const ft = document.getElementById('fileTree');
    const b = [...document.querySelectorAll('#fileTree button')].find((x) => x.textContent === 'pets.ts');
    return ft && !ft.hidden && b;
  }, { timeout: 5000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#fileTree button')].find((x) => x.textContent === 'pets.ts');
    b && b.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const petsAx = await page.$eval('#output', (c) => c.textContent);
  console.log('axios pets.ts uses http.get:', petsAx.includes('http.get<') || petsAx.includes('http.post<'));

  // 测试单文件布局
  await page.evaluate(() => { document.querySelector('input[name=layout][value=single]').click(); });
  await page.click('#genBtn');
  await page.waitForFunction(() => {
    const ft = document.getElementById('fileTree');
    return ft.hidden && document.getElementById('output').textContent.includes('BASE_URL');
  }, { timeout: 5000 });
  const singleHidden = await page.$eval('#fileTree', (f) => f.hidden);
  const singleContent = await page.$eval('#output', (c) => c.textContent);
  console.log('single layout hides tree:', singleHidden);
  console.log('single content has types inline:', singleContent.includes('export type ListPetsResponse'));

  console.log('\nPAGE ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  server.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
