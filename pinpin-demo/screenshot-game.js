const path = require('path');
// 找到 playwright 模块的路径
const pkg = require.resolve('playwright/package.json');
const { chromium } = require(path.dirname(pkg));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 400, height: 700 } });
  const page = await context.newPage();

  await page.goto('http://localhost:8089/index.html');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/Users/lnmacmini/Projects/personal-site/pinpin-demo/demo-02-game.png' });

  await browser.close();
})();
