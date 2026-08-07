#!/usr/bin/env node
// E17 debug 2: check rAF heartbeat + cam + playerScreenPos in dungeon
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { appendFileSync } from "node:fs";
const L = (m) => appendFileSync("/tmp/e17dbg3.log", m + "\n");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = "/Users/lnmacmini/Projects/personal-site/games/jianghu/apps/web-client";
const JIANGHU = "/Users/lnmacmini/Projects/personal-site/games/jianghu/apps/jianghu";
const PORT = 3011, STATIC = 8091;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function probeServer(port) { return new Promise((resolve) => { const sock = net.connect(port, "127.0.0.1", () => { sock.destroy(); resolve(true); }); sock.on("error", () => resolve(false)); }); }
function startServer() {
  const proc = spawn(process.execPath, ["--experimental-strip-types", "src/server.ts"], { cwd: JIANGHU, env: { ...process.env, DEV_SKIP_AUTH: "true", PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; proc.stdout.on("data", (d) => { log += d.toString(); }); proc.stderr.on("data", (d) => { log += d.toString(); });
  const ready = new Promise((resolve, reject) => { const t0 = Date.now(); const iv = setInterval(() => { if (log.includes("listening on")) { clearInterval(iv); resolve(); } else if (Date.now() - t0 > 8000) { clearInterval(iv); reject(new Error("timeout")); } }, 150); });
  return { proc, ready };
}
function startStatic() {
  const server = http.createServer((req, res) => {
    let fp = path.join(WEB, decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\//, ""));
    if (!fp.startsWith(WEB)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(data); });
  });
  return new Promise((resolve) => server.listen(STATIC, "127.0.0.1", () => resolve(server)));
}
async function waitFor(page, fn, timeoutMs) { try { await page.waitForFunction(fn, { timeout: timeoutMs, polling: 120 }); return true; } catch { return false; } }
async function walkToward(page, getTarget, distThreshold, maxIter) {
  for (let i = 0; i < (maxIter || 30); i++) {
    const nav = await page.evaluate((getTargetStr) => { const g = window.__game, s = g.lastSnapshot; if (!s || g.localEntityId == null) return null; const me = s.entities.find((e) => e.id === g.localEntityId); const target = eval(getTargetStr); if (!me || !target) return null; return { mx: me.pos.x, my: me.pos.y, tx: target.x, ty: target.y, d: Math.hypot(target.x - me.pos.x, target.y - me.pos.y) }; }, getTarget);
    if (!nav) { await sleep(150); continue; }
    if (nav.d <= distThreshold) return { ok: true };
    const dx = nav.tx - nav.mx, dy = nav.ty - nav.my;
    const key = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "KeyD" : "KeyA") : (dy > 0 ? "KeyS" : "KeyW");
    await page.keyboard.down(key); await sleep(140); await page.keyboard.up(key); await sleep(90);
  }
  return { ok: false };
}

const main = async () => {
  const existing = await probeServer(PORT);
  let server = null;
  if (!existing) { server = startServer(); await server.ready; L("server up"); }
  const staticSrv = await startStatic();
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const pA = await browser.newPage();
    const pB = await browser.newPage();
    await pA.setViewport({ width: 960, height: 720 });
    await pB.setViewport({ width: 960, height: 720 });
    const errA = [];
    pA.on("pageerror", (e) => errA.push(String(e)));
    const base = `http://127.0.0.1:${STATIC}/index.html?server=ws://127.0.0.1:${PORT}&debug=1&devUserId=`;
    await pA.goto(base + "dbgC_" + Date.now(), { waitUntil: "domcontentloaded" });
    await pB.goto(base + "dbgD_" + Date.now(), { waitUntil: "domcontentloaded" });
    await waitFor(pA, "window.__game && window.__game.connected && window.__game.state === 'overworld' && window.__game.localEntityId != null", 15000);
    await waitFor(pB, "window.__game && window.__game.connected && window.__game.state === 'overworld' && window.__game.localEntityId != null", 15000);
    // overworld: sample rAF heartbeat
    L("-- OVERWORLD rAF heartbeat --");
    for (let i = 0; i < 5; i++) {
      const s = await pA.evaluate(() => ({
        vis: document.visibilityState,
        cam: { cx: Math.round(window.__game.cam.cx), cy: Math.round(window.__game.cam.cy), scale: window.__game.cam.scale },
        psp: window.__game.playerScreenPos ? { x: Math.round(window.__game.playerScreenPos.x), y: Math.round(window.__game.playerScreenPos.y) } : null,
        rendered: window.__game.rendered,
      }));
      L(JSON.stringify(s));
      await sleep(200);
    }
    const entExpr = `s.entities.find(e => e.kind === 5) ? { x: s.entities.find(e => e.kind === 5).pos.x, y: s.entities.find(e => e.kind === 5).pos.y } : null`;
    await walkToward(pA, entExpr, 40, 30);
    await walkToward(pB, entExpr, 40, 30);
    await pA.evaluate(() => window.__game.debugEnterDungeon());
    await waitFor(pA, "window.__game.state === 'dungeon'", 5000);
    await pB.evaluate(() => window.__game.debugEnterDungeon());
    await waitFor(pB, "window.__game.state === 'dungeon'", 5000);
    await waitFor(pA, "window.__game.partyMembers.length >= 1", 6000);
    L("-- DUNGEON rAF heartbeat (both players) --");
    for (let i = 0; i < 8; i++) {
      const s = await pA.evaluate(() => ({
        vis: document.visibilityState,
        tick: window.__game.lastTick,
        cam: { cx: Math.round(window.__game.cam.cx), cy: Math.round(window.__game.cam.cy), scale: window.__game.cam.scale },
        psp: window.__game.playerScreenPos ? { x: Math.round(window.__game.playerScreenPos.x), y: Math.round(window.__game.playerScreenPos.y) } : null,
        rendered: window.__game.rendered,
        players: window.__game.lastSnapshot.entities.filter((e) => e.kind === 0).map((e) => ({ id: e.id, x: Math.round(e.pos.x), y: Math.round(e.pos.y) })),
      }));
      L(JSON.stringify(s));
      await sleep(250);
    }
    L("errA=" + JSON.stringify(errA.slice(0, 8)));
    // check rAF by explicit counter
    const rafProbe = await pA.evaluate(() => new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      function step() { n++; if (performance.now() - t0 < 500) requestAnimationFrame(step); else res(n); }
      requestAnimationFrame(step);
    }));
    L("rAF frames in 500ms = " + rafProbe);
    await pA.evaluate(() => window.__game.debugExitDungeon());
    await pB.evaluate(() => window.__game.debugExitDungeon());
  } finally {
    await browser.close();
    staticSrv.close();
    if (server) server.proc.kill("SIGTERM");
  }
};
main().catch((e) => { console.error(e); process.exit(2); });
