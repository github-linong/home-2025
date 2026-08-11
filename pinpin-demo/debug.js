const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 400, height: 700 } });
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.log(`[BROWSER ERROR] ${err.message}`);
  });

  console.log('Navigating to pinpin page...');
  await page.goto('http://localhost:4321/demos/pinpin', { waitUntil: 'networkidle', timeout: 30000 });
  
  console.log('Waiting 5s for Phaser to load...');
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: '/Users/lnmacmini/Projects/personal-site/pinpin-demo/debug-screenshot.png', fullPage: false });
  console.log('Screenshot saved');

  await browser.close();
  console.log('Done');
})();
