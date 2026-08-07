const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:8095/demos/html/swagger-to-ts-client.html');
  await page.waitForSelector('#genBtn');

  // click generate
  await page.click('#genBtn');
  await page.waitForSelector('#fileTree button[data-file="types.d.ts"]', { timeout: 5000 });

  const dims = await page.evaluate(() => {
    const io = document.querySelector('.io');
    const panels = [...io.querySelectorAll(':scope > .panel')];
    const fileTree = document.querySelector('.file-tree');
    const codeWrap = document.querySelector('.code-wrap');
    return {
      ioHasTreeActive: io.classList.contains('tree-active'),
      leftPanelW: panels[0]?.getBoundingClientRect().width,
      rightPanelW: panels[1]?.getBoundingClientRect().width,
      fileTreeHidden: fileTree?.hidden,
      codeWrapW: codeWrap?.getBoundingClientRect().width,
    };
  });

  console.log('dims:', JSON.stringify(dims, null, 2));

  // assert input panel has min-width and output panel wider than input panel (5fr vs 7fr)
  if (!dims.ioHasTreeActive) throw new Error('io should have tree-active');
  if (dims.leftPanelW < 500) throw new Error(`input panel too narrow: ${dims.leftPanelW}`);
  if (dims.rightPanelW <= dims.leftPanelW) throw new Error(`right panel (${dims.rightPanelW}) should be wider than left (${dims.leftPanelW})`);

  // file tree visible by default (user wants default-expanded); verify
  if (dims.fileTreeHidden) throw new Error('file tree should be VISIBLE by default');
  if (dims.codeWrapW < 400) throw new Error(`code wrap too narrow when tree expanded: ${dims.codeWrapW}`);

  // click toolbar button to HIDE file tree; verify it hides and code widens
  await page.click('#filesBtn');
  await new Promise((r) => setTimeout(r, 200));
  const dims2 = await page.evaluate(() => ({
    fileTreeHidden: document.querySelector('.file-tree')?.hidden,
    fileTreeW: document.querySelector('.file-tree')?.getBoundingClientRect().width,
    codeWrapW: document.querySelector('.code-wrap')?.getBoundingClientRect().width,
  }));
  console.log('hidden dims:', JSON.stringify(dims2, null, 2));
  if (!dims2.fileTreeHidden) throw new Error('file tree should be hidden after clicking filesBtn');
  if (dims2.codeWrapW <= dims.codeWrapW) throw new Error('code should widen when file tree hidden');

  console.log('layout E2E PASS');
  await browser.close();
})();
