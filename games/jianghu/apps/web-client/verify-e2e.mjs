#!/usr/bin/env node
/**
 * verify-e2e.mjs — jianghu C1 浏览器客户端 E2E（Puppeteer 真连真实服务端）
 * ============================================================================
 * 用法：
 *   node verify-e2e.mjs [--port 3011] [--static 8090] [--headless]
 *
 * 自管进程：
 *   1) spawn jianghu 服务端（DEV_SKIP_AUTH=true PORT=3011，cwd=apps/jianghu）
 *   2) spawn 静态服务器（serve 本 web-client 目录）
 *   3) Puppeteer 打开 index.html?server=ws://127.0.0.1:3011&devUserId=e2ehero&debug=1
 *   4) 断言链：连接→room.join→二进制快照→MOVE→SKILL1→进副本→敌人HP→出本→重连
 *   5) 截图存 ./verify/*.png；退出码 0=全绿 1=有失败
 *
 * 诚实说明验证边界：见输出 JSON 的 notes 字段（如 SKILL 命中与否受副本随机布局影响）。
 */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const JIANGHU_APP = path.join(REPO_ROOT, "games", "jianghu", "apps", "jianghu");
const OUT_DIR = path.join(__dirname, "verify");

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const PORT = Number(arg("--port", "3011"));
const STATIC_PORT = Number(arg("--static", "8090"));
const HEADLESS = !args.includes("--headed");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let results = [];
function record(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }

// ── 1) 起 jianghu 服务端 ──
function startServer() {
  const proc = spawn(process.execPath, ["--experimental-strip-types", "src/server.ts"], {
    cwd: JIANGHU_APP,
    env: { ...process.env, DEV_SKIP_AUTH: "true", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (d) => { log += d.toString(); });
  proc.stderr.on("data", (d) => { log += d.toString(); });
  const ready = new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (log.includes("listening on")) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > 8000) { clearInterval(iv); reject(new Error("server start timeout: " + log)); }
    }, 150);
  });
  return { proc, ready, log: () => log };
}

// ── 2) 静态服务器（serve web-client 目录）──
function startStatic() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let fp = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);
    if (!fp.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      const ext = path.extname(fp);
      const type = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "application/octet-stream";
      res.writeHead(200, { "content-type": type + "; charset=utf-8" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(STATIC_PORT, "127.0.0.1", () => resolve(server)));
}

// ── Puppeteer 辅助 ──
async function waitFor(page, fnExpr, timeoutMs, label) {
  try {
    await page.waitForFunction(fnExpr, { timeout: timeoutMs, polling: 120 });
    return true;
  } catch (e) {
    const st = await page.evaluate(() => {
      const g = window.__game;
      return g ? { state: g.state, connected: g.connected, snapshotCount: g.snapshotCount, errors: g.errors.slice(-3) } : "no __game";
    }).catch(() => "eval failed");
    console.log(`   [waitFor ${label}] timeout. __game=${JSON.stringify(st)}`);
    return false;
  }
}

const main = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = startServer();
  await server.ready;
  console.log("[e2e] jianghu server up on :" + PORT);
  const staticSrv = await startStatic();
  console.log("[e2e] static server up on :" + STATIC_PORT);

  let browser = null;
  const pageErrors = [];
  const consoleErrors = [];
  try {
    browser = await puppeteer.launch({ headless: HEADLESS, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

    const url = `http://127.0.0.1:${STATIC_PORT}/index.html?server=ws://127.0.0.1:${PORT}&devUserId=e2ehero&debug=1`;
    console.log("[e2e] open " + url);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // ── A. 连接 → session.ready → room.join → 二进制快照 ──
    const okReady = await waitFor(page, "window.__game && window.__game.connected === true && window.__game.state === 'overworld'", 15000, "connect+join");
    record("A1 连接+room.join", okReady, okReady ? `state=${await page.evaluate(() => window.__game.state)}` : undefined);

    const okSnap = await waitFor(page, "window.__game && window.__game.lastSnapshot && window.__game.localEntityId != null && window.__game.lastSnapshot.entities.length >= 5", 10000, "binary snapshot");
    const snapInfo = okSnap ? await page.evaluate(() => ({
      tick: window.__game.lastTick, count: window.__game.lastSnapshot.entities.length,
      seatId: window.__game.seatId, kinds: [...new Set(window.__game.lastSnapshot.entities.map(e => e.kind))],
    })) : null;
    record("A2 二进制快照(主世界实体≥5)", okSnap, okSnap ? `tick=${snapInfo.tick} entities=${snapInfo.count} kinds=${snapInfo.kinds.join(",")} seatId=${snapInfo.seatId}` : undefined);

    // ── B. MOVE → 玩家位移 ──
    const pos0 = await page.evaluate(() => ({ ...window.__game.lastLocalPos }));
    await page.keyboard.down("KeyD");
    await sleep(1000);
    await page.keyboard.up("KeyD");
    await sleep(350);
    const pos1 = await page.evaluate(() => ({ ...window.__game.lastLocalPos }));
    const dx = pos1.x - pos0.x;
    record("B1 移动(MOVE dir=E)", dx > 20, `pos ${pos0.x},${pos0.y} → ${pos1.x},${pos1.y} (dx=${dx.toFixed(1)}px)`);
    await page.screenshot({ path: path.join(OUT_DIR, "01-overworld.png") });

    // ── C. SKILL1（主世界无敌人：断言服务端接受 cast → skillCd>0）──
    await page.keyboard.press("Digit1");
    await sleep(900);
    const skillCd0 = await page.evaluate(() => window.__game.skillCd.slice());
    record("C1 技能1被服务端接受", skillCd0[0] > 0, `skillCd=[${skillCd0.join(",")}] (tick→${(skillCd0[0] / 12).toFixed(1)}s)`);

    // ── D. 进副本：走到入口附近按 F（真实输入路径）；超时兜底 debug 钩子 ──
    let enteredVia = "walk+F";
    let okEnter = false;
    let walkTrace = [];
    for (let i = 0; i < 16 && !okEnter; i++) {
      const nav = await page.evaluate(() => {
        const g = window.__game, s = g.lastSnapshot;
        if (!s) return null;
        const me = s.entities.find((e) => e.id === g.localEntityId);
        const ent = s.entities.find((e) => e.kind === 5);
        return me && ent ? { mx: me.pos.x, my: me.pos.y, ex: ent.pos.x, ey: ent.pos.y, state: g.state } : null;
      });
      if (!nav) { await sleep(200); continue; }
      const dxEnt = nav.ex - nav.mx;
      walkTrace.push({ i, dx: Math.round(dxEnt), state: nav.state });
      if (Math.abs(dxEnt) <= 120) {
        await page.keyboard.down("KeyF");
        await page.keyboard.up("KeyF");
        await sleep(500);
        okEnter = await waitFor(page, "window.__game.state === 'dungeon'", 3500, "enter dungeon");
        if (okEnter) break;
      } else {
        await page.keyboard.down(dxEnt > 0 ? "KeyD" : "KeyA");
        await sleep(180);
        await page.keyboard.up(dxEnt > 0 ? "KeyD" : "KeyA");
        await sleep(120);
      }
    }
    if (!okEnter) {
      const errs = await page.evaluate(() => window.__game.errors.slice(0, 5)).catch(() => []);
      console.log("   [walk] trace=" + JSON.stringify(walkTrace) + " errors=" + JSON.stringify(errs));
    }
    if (!okEnter && (await page.evaluate(() => !!window.__game.debugEnterDungeon))) {
      enteredVia = "debug hook (walk 超时兜底)";
      await page.evaluate(() => window.__game.debugEnterDungeon());
      okEnter = await waitFor(page, "window.__game.state === 'dungeon'", 5000, "enter dungeon (debug)");
    }
    const dungeonInfo = okEnter ? await page.evaluate(() => ({
      roomId: window.__game.roomId,
      kinds: [...new Set(window.__game.lastSnapshot.entities.map((e) => e.kind))],
      count: window.__game.lastSnapshot.entities.length,
    })) : null;
    record("D1 进副本(dungeon.enter)", okEnter, okEnter ? `via=${enteredVia} roomId=${dungeonInfo.roomId} kinds=${dungeonInfo.kinds.join(",")} entities=${dungeonInfo.count}` : undefined);
    const okEnemy = okEnter ? await waitFor(page, "window.__game.lastSnapshot.entities.some(e => e.kind===1 || e.kind===2)", 6000, "dungeon enemies") : false;
    record("D2 副本快照含敌人/BOSS", okEnemy);
    await page.screenshot({ path: path.join(OUT_DIR, "02-dungeon.png") });

    // ── E. 技能命中敌人（副本内）──
    if (okEnter && okEnemy) {
      const before = await page.evaluate(() => window.__game.lastSnapshot.entities
        .filter((e) => e.kind === 1 || e.kind === 2)
        .map((e) => ({ id: e.id, hp: e.hp })));
      await page.keyboard.press("Digit1");
      await sleep(1000);
      const after = await page.evaluate(() => ({
        enemies: window.__game.lastSnapshot.entities
          .filter((e) => e.kind === 1 || e.kind === 2)
          .map((e) => ({ id: e.id, hp: e.hp })),
        skillCd: window.__game.skillCd.slice(),
      }));
      const dropped = before.filter((b) => {
        const a = after.enemies.find((x) => x.id === b.id);
        return a && a.hp < b.hp;
      });
      record("E1 技能命中敌人(HP 下降)", dropped.length > 0,
        dropped.length > 0
          ? `敌人 ${dropped.length} 个 HP 下降：${dropped.map((d) => `${d.id}:${d.hp}→${after.enemies.find((x) => x.id === d.id).hp}`).join(", ")}`
          : `无敌人进入技能范围（随机布局）—— 技能已被服务端接受(skillCd=[${after.skillCd.join(",")}])`);
    } else {
      record("E1 技能命中敌人", false, "SKIPPED（未进副本/无敌人）");
    }

    // ── F. 出本 ──
    if (okEnter) {
      await page.keyboard.press("KeyF");
      const okExit = await waitFor(page, "window.__game.state === 'overworld' && window.__game.roomId === 'room_resident_public'", 6000, "exit dungeon");
      record("F1 出本(dungeon.exit)", okExit);
    } else {
      record("F1 出本(dungeon.exit)", false, "SKIPPED（未进副本）");
    }
    await page.screenshot({ path: path.join(OUT_DIR, "03-after-exit.png") });

    // ── G. 断线自动重连（CDP 模拟网络中断 → 服务端 ping 超时断开 → 恢复后 session.reconnect）──
    let recOk = false;
    let recDetail = "";
    try {
      const cdp = await page.createCDPSession();
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
      await sleep(7000); // 让服务端 ping 超时(5s)断开
      const stOffline = await page.evaluate(() => window.__game.state).catch(() => "eval-fail");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      const okRec = await waitFor(page, "window.__game.connected === true && window.__game.state === 'overworld'", 20000, "reconnect");
      const stAfter = okRec ? await page.evaluate(() => ({ state: window.__game.state, roomId: window.__game.roomId })) : null;
      recOk = okRec;
      recDetail = `offline 期间 state=${stOffline} → 恢复后 ${okRec ? `state=${stAfter.state} roomId=${stAfter.roomId}` : "未恢复"}`;
    } catch (e) {
      recDetail = "reconnect 测试异常: " + String(e);
    }
    record("G1 断线自动重连(session.reconnect)", recOk, recDetail);

    // ── H. 无 pageerror / 渲染健康 ──
    const gameErrors = await page.evaluate(() => window.__game.errors.slice(0, 8)).catch(() => []);
    record("H1 无 pageerror", pageErrors.length === 0, pageErrors.length ? pageErrors.join(" | ") : "pageErrors=0");
    record("H2 无 JS 运行时错误(收集)", gameErrors.length === 0, gameErrors.length ? gameErrors.join(" | ") : "GAME.errors=0");
    record("H3 控制台无 error", consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(" | ") : "consoleErrors=0");

    await page.screenshot({ path: path.join(OUT_DIR, "04-final.png") });
  } catch (err) {
    record("E2E 整体", false, String(err && err.stack || err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    staticSrv.close();
    server.proc.kill("SIGTERM");
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n================ E2E SUMMARY ================");
  console.log(JSON.stringify({
    results,
    pass: results.filter((r) => r.ok).length,
    fail: failed.length,
    total: results.length,
    notes: [
      "验证边界：Puppeteer headless 真连真实 jianghu 服务端(DEV_SKIP_AUTH=true, port 3011)。",
      "技能命中敌人受副本随机布局影响：未命中时以「服务端接受 cast(skillCd>0)」为次优断言。",
      "重连测试用 CDP 模拟断网(服务端 ping 超时断开)→ 恢复后 session.reconnect。",
    ],
  }, null, 2));
  process.exit(failed.length > 0 ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(2); });
