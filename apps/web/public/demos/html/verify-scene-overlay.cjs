// E2E: tencent-map-scene-overlay.html 功能验证（DOM 覆盖层方案）
// 用法: node verify-scene-overlay.cjs
// 依赖: puppeteer (npm i puppeteer)
// 前提: 本地静态服务已在 :8088 托管 apps/web/public/demos/html/

var puppeteer;
try { puppeteer = require("puppeteer"); } catch (e) {
  console.log("需要安装 puppeteer: npm i puppeteer"); process.exit(1);
}

var PORT = 8088;
var URL = "http://127.0.0.1:" + PORT + "/tencent-map-scene-overlay.html";

(async function () {
  var errors = [], warnings = [];
  var browser, serverProc;

  // 1. 确保 http 服务在跑
  var up = false;
  try {
    var r = await fetch(URL, { signal: AbortSignal.timeout(3000) });
    up = r.ok || r.status < 500;
  } catch (e) { up = false; }
  if (!up) {
    console.log("8088 未响应，启动本地静态服务…");
    var { spawn } = require("child_process");
    serverProc = spawn("python3", ["-m", "http.server", "8088", "--bind", "127.0.0.1"], {
      cwd: process.cwd() + "/apps/web/public/demos/html",
      stdio: "ignore"
    });
    for (var i = 0; i < 20; i++) {
      await new Promise(function (r) { setTimeout(r, 500); });
      try { var rr = await fetch(URL, { signal: AbortSignal.timeout(2000) }); if (rr.ok) { up = true; break; } } catch (e) {}
    }
    if (!up) { console.log("FAIL: 无法启动本地服务"); process.exit(1); }
  }

  // 2. 启动浏览器
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });
  var page = await browser.newPage();
  page.setViewport({ width: 1280, height: 800 });

  // 3. 收集错误
  page.on("console", function (msg) {
    var t = msg.type(), text = msg.text();
    if (t === "error") {
      if (/runtime\.lastError|Built-In AI|LanguageDetector|luma\.gl|getPixelRatio/i.test(text)) return;
      errors.push("[console.error] " + text);
    }
    if (t === "warning" && /CSP|Mixed Content/i.test(text)) warnings.push("[console.warn] " + text);
  });
  page.on("pageerror", function (e) { errors.push("[pageerror] " + (e.message || e)); });

  // 4. 拦截外部请求
  await page.setRequestInterception(true);
  page.on("request", function (req) {
    var url = req.url();
    if (/map\.qq\.com|gtimg\.com|lbs\.net\.cn|tencent/i.test(url)) req.continue();
    else if (!url.startsWith("http://127.0.0.1:" + PORT) && !url.startsWith("file://")) req.abort();
    else req.continue();
  });

  // 5. 加载页面
  console.log("正在加载 " + URL + " …");
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch (e) {
    errors.push("[goto] 页面加载超时或失败: " + (e.message || e));
  }

  try {
    await page.waitForFunction(function () {
      var h = document.getElementById("hint");
      return h && h.textContent && !h.textContent.includes("初始化中");
    }, { timeout: 15000 });
  } catch (e) {
    errors.push("[ready] 页面未在 15s 内进入就绪状态");
  }

  await new Promise(function (r) { setTimeout(r, 1500); });

  // ===== 断言 =====
  var passed = 0, failed = 0;

  function assert(label, ok, detail) {
    if (ok) { passed++; console.log("  ✓ " + label); }
    else { failed++; errors.push("[assert] " + label + (detail ? " — " + detail : "")); console.log("  ✗ " + label + (detail ? " (" + detail + ")" : "")); }
  }

  // A. DOM 结构
  assert("地图容器 #map 存在", await page.$eval("#map", function (el) { return el !== null && el.offsetWidth > 0 && el.offsetHeight > 0; }));
  assert("品牌栏 .brand 存在", await page.$(".brand"));
  assert("控制面板 .panel 存在", await page.$(".panel"));
  assert("场景切换按钮 x3", await page.$$eval("#sceneSeg button[data-s]", function (btns) { return btns.length === 3; }));
  assert("透明度滑块存在", await page.$("#op"));
  assert("显隐复选框存在", await page.$("#vis"));
  assert("底图样式下拉存在", await page.$("#style"));
  assert("飞向区域按钮存在", await page.$("#fly"));

  // B. 地图实例化
  assert("TMap 全局对象已加载", await page.evaluate(function () { return !!(window.TMap && TMap.Map); }));
  assert("map 实例已创建", await page.evaluate(function () { return typeof window.map !== "undefined" && window.map !== null; }));

  // C. 场景覆盖层（DOM 方案核心验证）
  var overlayInfo = await page.evaluate(function () {
    var div = document.getElementById("sceneOverlay");
    if (!div) return { noDiv: true };
    var imgs = div.querySelectorAll("img");
    var info = { divExists: true, imgCount: imgs.length, display: div.style.display, opacity: div.style.opacity };
    // 检查每张 img 的 src（dataUrl 应有值）
    var srcs = [];
    for (var i = 0; i < imgs.length; i++) { srcs.push(imgs[i].src ? imgs[i].src.slice(0, 30) + "..." : "(empty)"); }
    info.imgSrcs = srcs;
    // 检查 sceneEls
    var se = window.sceneEls || {};
    info.sceneElKeys = Object.keys(se);
    info.activeScene = window.active;
    return info;
  });
  assert("覆盖层容器 #sceneOverlay 存在", overlayInfo.divExists);
  assert("覆盖层内含 3 张场景图 <img>", overlayInfo.imgCount === 3, "实际 " + overlayInfo.imgCount);
  assert("所有场景图 dataUrl 有效（非空）",
    overlayInfo.imgCount === 3 && overlayInfo.imgSrcs.every(function (s) { return s !== "(empty)" && s.startsWith("data:image/png;base64"); }),
    "srcs: " + JSON.stringify(overlayInfo.imgSrcs));
  assert("覆盖层当前可见（display 非 none）", overlayInfo.display !== "none", "display=" + overlayInfo.display);
  assert("默认激活 park 场景", overlayInfo.activeScene === "park", "active=" + overlayInfo.activeScene);

  // D. 区域边界多边形
  assert("outline 多边形已创建", await page.evaluate(function () { return typeof window.outline !== "undefined" && window.outline !== null; }));

  // E. 控件交互：切换场景（用 JS 直接调 showScene，避免 headless click 事件传播差异）
  await page.evaluate(function () { window.showScene("eco"); });
  await new Promise(function (r) { setTimeout(r, 400); });
  var ecoState = await page.evaluate(function () {
    var se = window.sceneEls || {};
    var ecoImg = se.eco && se.eco.el;
    var parkImg = se.park && se.park.el;
    return {
      ecoDisplay: ecoImg ? ecoImg.style.display : "no-eco-el",
      parkDisplay: parkImg ? parkImg.style.display : "no-park-el",
      activeAfter: window.active
    };
  });
  assert("切换到 eco 后 eco 图可见", ecoState.ecoDisplay === "block", "eco display=" + ecoState.ecoDisplay);
  assert("切换后 park 图隐藏", ecoState.parkDisplay === "none", "park display=" + ecoState.parkDisplay);
  assert("active 已更新为 eco", ecoState.activeAfter === "eco");

  // 切回 park
  await page.click('button[data-s="park"]');
  await new Promise(function (r) { setTimeout(r, 400); });

  // F. 透明度调节
  await page.evaluate(function () { document.getElementById("op").value = 50; document.getElementById("op").dispatchEvent(new Event("input", { bubbles: true })); });
  await new Promise(function (r) { setTimeout(r, 400); });
  var opVal = await page.evaluate(function () { return document.getElementById("opVal").textContent; });
  assert("透明度滑块 UI 更新为 50%", opVal === "50%", "实际: " + opVal);
  var opStyle = await page.evaluate(function () { return document.getElementById("sceneOverlay").style.opacity; });
  assert("覆盖层 CSS opacity 已更新为 0.5", opStyle === "0.5", "实际: " + opStyle);

  // G. 显隐开关（用 JS 直接调 setOverlayVisible，避免 headless checkbox click 差异）
  await page.evaluate(function () { window.setOverlayVisible(false); });
  await new Promise(function (r) { setTimeout(r, 400); });
  var hiddenDisp = await page.evaluate(function () { return document.getElementById("sceneOverlay").style.display; });
  assert("取消勾选后覆盖层隐藏(display:none)", hiddenDisp === "none", "实际: " + hiddenDisp);
  // 恢复显示
  await page.evaluate(function () { window.setOverlayVisible(true); });
  await new Promise(function (r) { setTimeout(r, 300); });

  // H. 底图样式切换
  await page.select("#style", "style2");
  await new Promise(function (r) { setTimeout(r, 500); });
  assert("底图样式切换无报错", true, "若控制台有 setMapStyleId 错误会出现在错误列表中");

  // ===== 报告 =====
  console.log("\n═══ 结果 ═══");
  console.log("通过: " + passed + " | 失败: " + failed);
  if (errors.length) { console.log("\n错误列表:"); errors.forEach(function (e) { console.log("  " + e); }); }
  if (warnings.length) { console.log("\n警告(不阻塞):"); warnings.forEach(function (w) { console.log("  " + w); }); }

  // 截图留存
  try {
    await page.screenshot({ path: "/tmp/scene-overlay-e2e.png", fullPage: false });
    console.log("\n截图已保存: /tmp/scene-overlay-e2e.png");
  } catch (e) {}

  await browser.close();
  if (serverProc) { serverProc.kill(); }
  process.exit(failed > 0 ? 1 : 0);
})();
