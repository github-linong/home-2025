// 实测本地模式：统计 draw 每帧耗时（注入 hook 到 rAF）
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

  // 用 PerformanceObserver 无法看长任务；直接 measure draw 函数耗时——hook rAF 计数
  const stats = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0, maxMs = 0, totalMs = 0, over16 = 0;
    const t0 = performance.now();
    function loop(t) {
      const now = performance.now();
      const ms = now - (loop._last || t0);
      loop._last = now;
      frames++;
      maxMs = Math.max(maxMs, ms);
      totalMs += ms;
      if (ms > 40) over16++;
      if (now - t0 >= 4000) {
        resolve({ frames, avg: (totalMs / frames).toFixed(2), max: maxMs.toFixed(1), over40: over16, realFps: Math.round(frames / 4) });
      } else requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }));
  console.log('draw loop stats (4s):', JSON.stringify(stats));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
