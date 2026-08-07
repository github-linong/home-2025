/**
 * verify-feel.mjs — WEB-FEEL 自动化验证台（silky local-player movement）
 *
 * 自包含：本脚本自行拉起一个使用【新 sim-core】的 dungeon-server（DEV_SKIP_AUTH，
 * 独立测试端口，避免复用可能仍加载旧 sim-core 的运行中服务），并用极简静态服务器
 * 提供 web-client，随后用 puppeteer（真实 Chrome for Testing）跑浏览器端验证：
 *
 *   1) 页面无 console / page 错误（favicon 404 忽略）。
 *   2) SMOOTHNESS：按住 `w` ~1.1s，逐 animation frame 采样 window.__game.predicted，
 *      计算每样本位移的离散系数 CoV < 0.4（稳态、无剧烈跳变）且净速度 ≈ 210px/s（±25%）。
 *   3) CONVERGENCE：松开 `w` 后，predicted 收敛到权威 authPos（误差 < 8px）。
 *   4) 截图存至 apps/web-client/assets/verify-feel.png。
 *
 * 运行：node verify-feel.mjs   （须在项目根，使 import puppeteer 可解析）
 * 退出码 0 = 全部通过；非 0 = 存在失败项。
 */

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "games/dungeon-online");
const CLIENT_DIR = path.join(REPO, "apps/web-client");
const SERVER_SRC = path.join(REPO, "apps/dungeon-server/src/server.ts");
const SCREENSHOT = path.join(CLIENT_DIR, "assets/verify-feel.png");

const SERVER_PORT = 3017;
const STATIC_PORT = 8087;
const SERVER_URL = `ws://localhost:${SERVER_PORT}`;
const CLIENT_URL = `http://localhost:${STATIC_PORT}/index.html?server=${SERVER_URL}`;

const EXPECT_SPEED = 210; // 新 tank CLASS_BASE.moveSpeed（index.html PLAYER_SPEED）
const SPEED_TOL = 0.25;   // ±25%
const COV_MAX = 0.4;      // 离散系数上限（稳态判定）
const CONVERGE_PX = 8;    // 收敛阈值

const checks = [];
function check(id, label, pass, detail) {
  checks.push({ id, label, pass: !!pass, detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${id} — ${label}${detail ? "  (" + detail + ")" : ""}`);
}

// ───────────────────────── 静态文件服务器（仅服务 web-client） ─────────────────────────
function startStaticServer() {
  const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json",
    ".svg": "image/svg+xml", ".ico": "image/x-icon",
  };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";
        const filePath = path.join(CLIENT_DIR, path.normalize(urlPath));
        if (!filePath.startsWith(CLIENT_DIR)) { res.writeHead(403).end(); return; }
        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404).end("not found"); return; }
          res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
          res.end(data);
        });
      } catch {
        res.writeHead(500).end();
      }
    });
    srv.listen(STATIC_PORT, () => resolve(srv));
  });
}

// ───────────────────────── 拉起 dungeon-server（DEV_SKIP_AUTH） ─────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      ["--experimental-strip-types", SERVER_SRC],
      { env: { ...process.env, DEV_SKIP_AUTH: "true", PORT: String(SERVER_PORT) }, stdio: ["ignore", "pipe", "pipe"] }
    );
    let buf = "";
    const onData = (d) => {
      buf += d.toString();
      if (buf.includes("listening on")) resolve({ child, buf });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (d) => { buf += d.toString(); });
    child.on("exit", (code) => { if (!buf.includes("listening on")) reject(new Error("server exited code=" + code + " log=" + buf)); });
    setTimeout(() => reject(new Error("server start timeout; log=" + buf)), 15000);
  });
}

// ───────────────────────── 主流程 ─────────────────────────
const errors = [];
let browser, serverProc, staticSrv;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

try {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(" WEB-FEEL 浏览器端丝滑移动验证台 (puppeteer + 真实 Chrome)");
  console.log(` server=${SERVER_URL}  client=${CLIENT_URL}`);
  console.log("════════════════════════════════════════════════════════════\n");

  console.log("[1] 启动静态服务器 + dungeon-server（新 sim-core）...");
  staticSrv = await startStaticServer();
  const { child } = await startServer();
  serverProc = child;
  console.log("    server listening on :" + SERVER_PORT + " (DEV_SKIP_AUTH)");

  console.log("[2] 启动 puppeteer（headless Chrome）...");
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });

  page.on("console", (m) => {
    const t = m.type();
    const txt = m.text() || "";
    if (t === "error" && !/favicon/i.test(txt)) errors.push("console.error: " + txt);
  });
  page.on("pageerror", (e) => { if (!/favicon/i.test(String(e))) errors.push("pageerror: " + e.message); });
  page.on("requestfailed", (r) => {
    const u = r.url() || "";
    if (!/favicon/i.test(u)) errors.push("requestfailed: " + u + " " + (r.failure()?.errorText || ""));
  });

  console.log("[3] 打开客户端，等待进入 playing...");
  await page.goto(CLIENT_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForFunction(() => window.__game && window.__game.gameState === "playing", { timeout: 15000 });
  console.log("    gameState = playing ✓");

  // 确保页面聚焦，键盘事件可达 window
  await page.bringToFront();
  await page.mouse.click(512, 384);

  console.log("[4] 按住 W ~1.1s，逐帧采样 predicted...");
  await page.keyboard.down("w");
  await sleep(120); // 让预测接管、缓冲首帧

  const samples = await page.evaluate(() => new Promise((resolve) => {
    const arr = [];
    const start = performance.now();
    function tick() {
      const g = window.__game;
      const p = g && g.predicted;
      const a = g && g.authPos;
      if (p) arr.push({ t: performance.now(), x: p.x, y: p.y, ax: a ? a.x : null, ay: a ? a.y : null });
      if (performance.now() - start < 1100) requestAnimationFrame(tick);
      else resolve(arr);
    }
    requestAnimationFrame(tick);
  }));
  await page.keyboard.up("w");

  // 调试轨迹：predicted.y / authPos.y 在采样窗口的首/中/尾
  if (samples.length > 4) {
    const f = samples[0], m = samples[Math.floor(samples.length / 2)], l = samples[samples.length - 1];
    console.log(`   [debug] predicted.y: ${f.y.toFixed(1)} → ${m.y.toFixed(1)} → ${l.y.toFixed(1)}`);
    console.log(`   [debug] authPos.y:   ${f.ay?.toFixed(1)} → ${m.ay?.toFixed(1)} → ${l.ay?.toFixed(1)}`);
  }

  // ── 平滑度分析 ──
  if (samples.length < 10) {
    check("smooth", "逐帧采样样本充足", false, `samples=${samples.length}`);
  } else {
    const deltas = [];
    for (let i = 1; i < samples.length; i++) {
      deltas.push(Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
    }
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const variance = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / deltas.length;
    const std = Math.sqrt(variance);
    const cov = mean > 0 ? std / mean : 999;
    const first = samples[0], last = samples[samples.length - 1];
    const netDisp = Math.hypot(last.x - first.x, last.y - first.y);
    const durS = (last.t - first.t) / 1000;
    const netSpeed = durS > 0 ? netDisp / durS : 0;
    const fps = (samples.length - 1) / durS;
    check("smooth-cov", "位移离散系数 CoV < 0.4（稳态无剧烈跳变）", cov < COV_MAX,
      `CoV=${cov.toFixed(3)} (meanΔ=${mean.toFixed(2)}px std=${std.toFixed(2)}px) fps≈${fps.toFixed(0)}`);
    check("smooth-speed", `净速度 ≈ ${EXPECT_SPEED}px/s (±25%)`,
      netSpeed >= EXPECT_SPEED * (1 - SPEED_TOL) && netSpeed <= EXPECT_SPEED * (1 + SPEED_TOL),
      `netSpeed=${netSpeed.toFixed(1)}px/s (期望 ${EXPECT_SPEED * (1 - SPEED_TOL).toFixed(0)}~${EXPECT_SPEED * (1 + SPEED_TOL).toFixed(0)})`);
  }

  console.log("[5] 松开 W，等待收敛到权威 authPos...");
  await sleep(1500);
  const conv = await page.evaluate(() => {
    const g = window.__game;
    const p = g.predicted, a = g.authPos;
    if (!p || !a) return null;
    return { d: Math.hypot(p.x - a.x, p.y - a.y), px: p.x, py: p.y, ax: a.x, ay: a.y };
  });
  if (!conv) {
    check("converge", "predicted 收敛到 authPos", false, "predicted/authPos 缺失");
  } else {
    check("converge", `predicted 收敛到 authPos（误差 < ${CONVERGE_PX}px）`, conv.d < CONVERGE_PX,
      `err=${conv.d.toFixed(2)}px predicted=(${conv.px.toFixed(1)},${conv.py.toFixed(1)}) auth=(${conv.ax.toFixed(1)},${conv.ay.toFixed(1)})`);
  }

  console.log("[6] 截图...");
  await page.screenshot({ path: SCREENSHOT });
  console.log("    screenshot → " + SCREENSHOT);

  check("no-errors", "无 console / page 错误（favicon 忽略）", errors.length === 0,
    errors.length ? errors.slice(0, 5).join(" | ") : "clean");

} catch (e) {
  check("fatal", "脚本执行未抛异常", false, String(e && e.stack || e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (serverProc) serverProc.kill("SIGTERM");
  if (staticSrv) staticSrv.close();
}

console.log("\n──────────── 验证门结论 ────────────");
const passed = checks.filter((c) => c.pass).length;
const failed = checks.length - passed;
console.log(`  检查项：${checks.length}  通过：${passed}  失败：${failed}`);
const allPass = failed === 0;
console.log(`  结果：${allPass ? "PASS (丝滑移动验证成立)" : "FAIL"}`);
if (errors.length) { console.log("  错误明细："); for (const e of errors.slice(0, 8)) console.log("    - " + e); }
process.exit(allPass ? 0 : 1);
