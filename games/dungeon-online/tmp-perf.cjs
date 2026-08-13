// 实测本地模式 FPS（RAF + setInterval 各计数）
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => console.log('[pgerr]', String(e).slice(0, 120)));
  await page.goto('http://localhost:4321/games/dungeon/index.html?solo=1&server=ws://127.0.0.1:1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => document.getElementById('btn-local')?.click());
  await new Promise(r => setTimeout(r, 800));

  // 注入 FPS 探针（连续 3 秒统计 draw 调用）
  const result = await page.evaluate(async () => {
    let draws = 0, steps = 0;
    const od = window.__game ? (window.__game.draw ? null : null) : null;
    // 直接数 requestAnimationFrame 和 setInterval 节拍
    const t0 = performance.now();
    return await new Promise((resolve) => {
      const iv = setInterval(() => {
        const t1 = performance.now();
        if (t1 - t0 >= 3000) {
          clearInterval(iv);
          resolve({ ms: Math.round(t1 - t0), draws, steps });
        }
      }, 50);
      // 计数 draw 的调用：hook 前先拿引用
      // 简单方案：用 mutation observer 不行。用 performance + 手动数 RAF。
    });
  });
  console.log('timer probe:', JSON.stringify(result));

  // 用另一种方式：数页面 JS 事件循环繁忙度——直接量 rAF 帧率
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    function loop() {
      frames++;
      if (performance.now() - t0 >= 2000) resolve(Math.round(frames / 2));
      else requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }));
  console.log('RAF FPS (2s):', fps);
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
