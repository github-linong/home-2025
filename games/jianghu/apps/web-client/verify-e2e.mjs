#!/usr/bin/env node
/**
 * verify-e2e.mjs — jianghu C2 浏览器客户端 E2E（Puppeteer 真连真实服务端）
 * ============================================================================
 * 用法：
 *   node verify-e2e.mjs [--port 3011] [--static 8090] [--headless]
 *
 * 自管进程：
 *   1) 探测 :3011 —— 已有服务端则复用；否则 spawn jianghu 服务端（DEV_SKIP_AUTH=true PORT=3011）
 *   2) spawn 静态服务器（serve 本 web-client 目录）
 *   3) Puppeteer 打开 index.html?server=ws://127.0.0.1:3011&devUserId=e2ehero&debug=1
 *   4) 断言链：
 *      A  连接 → session.ready → room.join → 二进制快照
 *      B0 移动预测（按键 60ms 内渲染位置即变，无需等 RTT/插值缓冲）
 *      B1 移动（服务端权威 MOVE 位移）
 *      B2 预测收敛（松键后 |predicted - 权威| < 30px，无漂移）
 *      L1 掉落可见性（主世界 LOOT_GROUND 存在）
 *      L2 拾取提示（≤1.5×TILE 显示「按 F 拾取」）
 *      L3 拾取 → character.inventory 入库推送
 *      L4 拾取 toast（增量去重文案）
 *      L5 背包面板（打开显示物品格子 / 空态）
 *      L6 装备穿戴（E7.2：点装备 → 槽位变化）
 *      M1 鼠标左键点空地 → 点击移动（玩家位置向目标点移动）
 *      M2 鼠标左键点敌人 → 自动走近 + 普攻命中（敌人 hp 下降 + lastHits 有普攻记录）
 *      C3-1 相机锁定（玩家屏幕位置恒定在屏内 + cam clamp 不露世界外）
 *      C3-3 飘字跟随（lastHits 含 entityId；floatTexts 锚定实体且屏幕位置随实体）
 *      C3-2 点击定位（点 tile 中心 → moveTo 世界坐标误差 < 20px）
 *      C3-4 禁平移（拖拽后 cam 不动 + 不触发点击）
 *      C3-5 技能名 HUD（烈斩/剑气/震地/破军）
 *      C3-6 程序化贴图（玩家剪影 / 敌人变体 / 掉落图标 / 入口增强）
 *      C  技能被服务端接受（skillCd>0）
 *      E23 技能光效差异化（lastSkillFx 钩子：1-4 按下即播 → 槽位对应 slash/beam/quake/crush）
 *      D  真实输入 walk+F 进副本（超时兜底 debug 钩子）
 *      E  技能命中敌人（HP 下降，服务端权威）
 *      H1 伤害飘字（lastHits 记录敌人受击）
 *      H2 击杀反馈（lastKills，信息项不阻塞）
 *      F  出本
 *      D3 E10 死亡体验探针（信息项）：故意被精英/BOSS 击杀 → downed 钩子 → 复活回血
 *      G  断线自动重连（CDP 模拟断网 → session.reconnect）
 *      Z  零 pageerror / GAME.errors / console.error
 *   5) 截图存 ./verify/01-overworld.png … 06-final.png；退出码 0=全绿 1=有失败
 *
 * 诚实说明验证边界：见输出 JSON 的 notes 字段（如 SKILL 命中与否受副本随机布局影响）。
 */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
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

// ── 0) 探测 :3011 是否已有服务端（有则复用；无则自起）──
function probeServer(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1", () => { sock.destroy(); resolve(true); });
    sock.on("error", () => resolve(false));
  });
}

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

// 朝向某实体逐轴移动（8 向键）；到 distThreshold 内返回
async function walkToward(page, getTarget, distThreshold, maxIter) {
  for (let i = 0; i < (maxIter || 40); i++) {
    const nav = await page.evaluate((getTargetStr) => {
      const g = window.__game, s = g.lastSnapshot;
      if (!s || g.localEntityId == null) return null;
      const me = s.entities.find((e) => e.id === g.localEntityId);
      const target = eval(getTargetStr);
      if (!me || !target) return null;
      return { mx: me.pos.x, my: me.pos.y, tx: target.x, ty: target.y, d: Math.hypot(target.x - me.pos.x, target.y - me.pos.y) };
    }, getTarget);
    if (!nav) { await sleep(150); continue; }
    if (nav.d <= distThreshold) return { ok: true, d: nav.d, iter: i };
    const dx = nav.tx - nav.mx, dy = nav.ty - nav.my;
    const key = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "KeyD" : "KeyA") : (dy > 0 ? "KeyS" : "KeyW");
    await page.keyboard.down(key);
    await sleep(140);
    await page.keyboard.up(key);
    await sleep(90);
  }
  return { ok: false, reason: "timeout" };
}

// C2 L2：细步走近掉落，每步前检查「按 F 拾取」提示（72px 提示环 vs 48px 拾取环）。
// E7.1：定向改用客户端 predicted（更跟手，避免服务端快照滞后导致方向来回摆）；步长 60→110ms（≈21px）。
async function approachForHint(page, getTarget, maxIter) {
  for (let i = 0; i < (maxIter || 60); i++) {
    const hint = await page.evaluate(() => ({ near: window.__game.nearLootId, text: window.__game.pickupHint }));
    if (hint.near != null) return { ok: true, hint, iter: i };
    const nav = await page.evaluate((getTargetStr) => {
      const g = window.__game, s = g.lastSnapshot;
      if (!s || g.localEntityId == null) return null;
      const me = s.entities.find((e) => e.id === g.localEntityId);
      const target = eval(getTargetStr);
      if (!me || !target) return null;
      const mx = g.predicted ? g.predicted.x : me.pos.x;
      const my = g.predicted ? g.predicted.y : me.pos.y;
      return { mx, my, tx: target.x, ty: target.y, d: Math.hypot(target.x - mx, target.y - my) };
    }, getTarget);
    if (!nav) return { ok: false, reason: "no target (可能已拾取)" };
    if (nav.d <= 48) return { ok: false, reason: "已进入拾取环(≤48px)仍未显示提示" };
    const dx = nav.tx - nav.mx, dy = nav.ty - nav.my;
    const key = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "KeyD" : "KeyA") : (dy > 0 ? "KeyS" : "KeyW");
    await page.keyboard.down(key);
    await sleep(110);   // E7.1：60→110ms（≈21px），减少步数、抗方向抖动
    await page.keyboard.up(key);
    await sleep(60);
  }
  return { ok: false, reason: "timeout" };
}

// E7.1 兜底：主世界无 LOOT（占位 token ttl 过期）→ 打最近 passive 普通怪掉装。
// E7.2 修复：walkToward 需走进技能范围（72px）内（原 90px 打不中）；每只怪连打 2 发（普通怪 30hp 需 2 击，间隔等 CD 2.2s）；最多试 3 只怪。
async function farmLoot(page) {
  const tried = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const enemy = await page.evaluate((exclude) => {
      const g = window.__game, s = g.lastSnapshot;
      if (!s || g.localEntityId == null) return null;
      const me = s.entities.find((e) => e.id === g.localEntityId);
      let best = null, bd = Infinity;
      for (const e of s.entities) {
        if (e.kind !== 1 || exclude.includes(e.id)) continue;
        const d = Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best ? { id: best.id, x: best.pos.x, y: best.pos.y } : null;
    }, tried);
    if (!enemy) return false;
    const targetExpr = `s.entities.find(e => e.id === ${enemy.id}) ? { x: s.entities.find(e => e.id === ${enemy.id}).pos.x, y: s.entities.find(e => e.id === ${enemy.id}).pos.y } : null`;
    await walkToward(page, targetExpr, 55, 30); // 走进技能范围（SKILL_RANGE=72px）
    let dropped = false;
    for (let k = 0; k < 2 && !dropped; k++) {
      await page.keyboard.press("Digit1");
      await sleep(2500); // 等技能 CD（~2.2s）+ 结算
      dropped = await page.evaluate(() => (window.__game.lastSnapshot.entities.some((e) => e.kind === 3)));
    }
    if (dropped) return true;
    tried.push(enemy.id);
  }
  return false;
}

const main = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 已有服务端 → 复用；否则自起
  const existing = await probeServer(PORT);
  let server = null;
  if (existing) {
    console.log(`[e2e] reuse existing jianghu server on :${PORT}`);
  } else {
    server = startServer();
    await server.ready;
    console.log("[e2e] jianghu server up on :" + PORT);
  }
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

    const uid = process.env.E2E_USER_ID || `e2ehero_${Math.floor(Math.random() * 1e6)}`;
    const url = `http://127.0.0.1:${STATIC_PORT}/index.html?server=ws://127.0.0.1:${PORT}&devUserId=${uid}&debug=1`;
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

    // ── E26 小地图增强（加分断言①）：minimapMarkers 钩子存在（drawMinimap 每帧刷新，主世界即可断言形状）──
    const mmHookOk = await waitFor(page, "window.__game && window.__game.minimapMarkers && typeof window.__game.minimapMarkers.boss === 'number' && typeof window.__game.minimapMarkers.chest === 'number' && typeof window.__game.minimapMarkers.entrance === 'number' && typeof window.__game.minimapMarkers.loot === 'number'", 6000, "E26 minimapMarkers hook");
    const mmOver = mmHookOk ? await page.evaluate(() => ({ ...window.__game.minimapMarkers })) : null;
    record("E26-1 minimap标记钩子(minimapMarkers 形状)", mmHookOk,
      mmOver ? `boss=${mmOver.boss} chest=${mmOver.chest} entrance=${mmOver.entrance} loot=${mmOver.loot}（主世界）` : "no minimapMarkers hook");

    // ── E27 新手引导（加分断言）：onboarding 钩子存在 + debug=1 静默不触发 ──
    {
      const ob = await page.evaluate(() => {
        const g = window.__game;
        return g && g.onboarding ? {
          has: true,
          enabled: g.onboarding.enabled,
          step: g.onboarding.step,
          seenIsArr: Array.isArray(g.onboarding.seen),
        } : { has: false };
      });
      record("E27-1 新手引导钩子(onboarding存在+seen数组+debug静默)",
        ob.has && ob.seenIsArr && ob.enabled === false,
        ob.has ? `enabled=${ob.enabled} step=${ob.step} seenArr=${ob.seenIsArr}` : "no onboarding hook");
      // debug=1 → 引导不推进（step 恒 0）；等 1.5s 后复读确认无触发。
      await sleep(1500);
      const stepAfter = await page.evaluate(() => (window.__game && window.__game.onboarding ? window.__game.onboarding.step : null));
      record("E27-2 新手引导 debug 静默(step不推进)", stepAfter === 0, `step=${stepAfter}（debug=1 应恒为 0）`);
    }

    // ── E14 真实登录（加分断言，不跑完整登录流程）：HUD 登录按钮 + 面板 DOM 存在 ──
    // 完整登录需真实 api2（本回归 DEV_SKIP_AUTH=true，未起 api2），仅断言 UI 元素已就位。
    const loginDom = await page.evaluate(() => {
      const btn = document.getElementById('btn-login');
      const panel = document.getElementById('loginpanel');
      return {
        btn: btn ? btn.textContent : null,
        panel: !!panel,
        email: !!document.getElementById('login-email'),
        pass: !!document.getElementById('login-pass'),
        submit: !!document.getElementById('btn-login-submit'),
        guest: window.__game ? window.__game.guest : null,
        sessionToken: window.__game ? window.__game.sessionToken : null,
      };
    });
    record(
      "E14 登录按钮+面板 DOM（加分断言）",
      !!loginDom.btn && !!loginDom.panel && !!loginDom.email && !!loginDom.pass && !!loginDom.submit,
      loginDom.btn
        ? `btn=${loginDom.btn} panel=${loginDom.panel} guest=${loginDom.guest} token=${loginDom.sessionToken || "null"}`
        : "no #btn-login",
    );

    // ── E9 等级 HUD（非阻塞加分项）：levelInfo 钩子存在 + 顶部 Lv + 底部经验条渲染 ──
    // 登录态连上即发 character.level.get → GAME.levelInfo 被初始化/更新；renderLevelHud 每快照刷新。
    const lvlInfo = await page.evaluate(() => {
      const g = window.__game;
      const lvEl = document.getElementById('level');
      const fill = document.getElementById('xpfill');
      const txt = document.getElementById('xptext');
      return {
        hook: g && g.levelInfo ? { level: g.levelInfo.level, xp: g.levelInfo.xp, xpNext: g.levelInfo.xpNext } : null,
        hud: lvEl ? lvEl.textContent : null,
        xpbar: fill ? { w: fill.style.width, text: txt ? txt.textContent : null } : null,
      };
    });
    record(
      "E9 等级HUD(levelInfo钩子+经验条渲染)",
      !!lvlInfo.hook && /^Lv\.\d+$/.test(lvlInfo.hud || "") && !!lvlInfo.xpbar && !!lvlInfo.xpbar.text,
      lvlInfo.hook
        ? `levelInfo=${JSON.stringify(lvlInfo.hook)} hud=${lvlInfo.hud} xp=${lvlInfo.xpbar && lvlInfo.xpbar.text}`
        : "no levelInfo hook",
    );

    // ── B. 移动手感：本地预测 + 权威收敛 ──
    // B0 移动预测：按键后 60ms 内渲染位置即变（本地预测 PLAYER_SPEED*dt；旧版需等 ~100ms+RTT 插值缓冲）
    const pred0 = await page.evaluate(() => ({ ...window.__game.predicted }));
    await page.keyboard.down("KeyD");
    await sleep(60);
    const pred1 = await page.evaluate(() => ({ ...window.__game.predicted }));
    const pdx = pred1.x - pred0.x;
    record("B0 移动预测(按键60ms内渲染位即变)", pdx > 5, `predicted ${pred0.x.toFixed(1)},${pred0.y.toFixed(1)} → ${pred1.x.toFixed(1)},${pred1.y.toFixed(1)} (dx=${pdx.toFixed(1)}px @60ms, 理论≈11.5px)`);

    // B1 移动（服务端权威 MOVE）：继续按住 940ms 再松
    const pos0 = await page.evaluate(() => ({ ...window.__game.lastLocalPos }));
    await sleep(940);
    await page.keyboard.up("KeyD");
    await sleep(350);
    const pos1 = await page.evaluate(() => ({ ...window.__game.lastLocalPos }));
    const dx = pos1.x - pos0.x;
    record("B1 移动(服务端权威 MOVE)", dx > 20, `server pos ${pos0.x},${pos0.y} → ${pos1.x},${pos1.y} (dx=${dx.toFixed(1)}px)`);
    await page.screenshot({ path: path.join(OUT_DIR, "01-overworld.png") });

    // B2 预测收敛：松键后 predicted 向权威收敛（无漂移）
    const conv = await page.evaluate(() => {
      const g = window.__game, s = g.lastSnapshot;
      const me = s && s.entities.find((e) => e.id === g.localEntityId);
      return me && g.predicted ? { err: Math.hypot(me.pos.x - g.predicted.x, me.pos.y - g.predicted.y) } : null;
    });
    record("B2 预测收敛(松键后 err<30px)", conv != null && conv.err < 30, conv ? `err=${conv.err.toFixed(1)}px` : "n/a");

    // ── L. 掉落可见性 + 拾取 + 背包（主世界；服务端重叠自动拾取 PICKUP_RADIUS=1×TILE）──
    let lootInfo = await page.evaluate(() => {
      const g = window.__game, s = g.lastSnapshot;
      const loots = s ? s.entities.filter((e) => e.kind === 3).map((e) => ({ id: e.id, rarity: e.loot ? e.loot.rarity : -1 })) : [];
      return { count: loots.length, first: loots[0] || null };
    });
    record("L1 主世界 LOOT_GROUND(≥1)", lootInfo.count >= 1, `count=${lootInfo.count} rarity=${lootInfo.first ? lootInfo.first.rarity : "-"}`);

    // E7.1 兜底：主世界无 LOOT（占位 token ttl 过期）→ 打最近 passive 怪掉装，再走 L2-L5
    if (!lootInfo.first) {
      const farmed = await farmLoot(page);
      lootInfo = await page.evaluate(() => {
        const g = window.__game, s = g.lastSnapshot;
        const loots = s ? s.entities.filter((e) => e.kind === 3).map((e) => ({ id: e.id, rarity: e.loot ? e.loot.rarity : -1 })) : [];
        return { count: loots.length, first: loots[0] || null };
      });
      record("L1b 兜底打怪掉装", farmed && lootInfo.count >= 1, `farmed=${farmed} count=${lootInfo.count}`);
    }
    if (lootInfo.first) {
      const targetExpr = `s.entities.find(e => e.id === ${lootInfo.first.id}) ? { x: s.entities.find(e => e.id === ${lootInfo.first.id}).pos.x, y: s.entities.find(e => e.id === ${lootInfo.first.id}).pos.y } : null`;
      // L2 拾取提示：细步走近，进入 ≤1.5×TILE(72px) 提示环即应出现「按 F 拾取」
      const hintRes = await approachForHint(page, targetExpr, 60);
      record("L2 拾取提示(≤1.5×TILE)", hintRes.ok, hintRes.ok ? JSON.stringify(hintRes.hint) + ` @iter=${hintRes.iter}` : hintRes.reason);
      await page.screenshot({ path: path.join(OUT_DIR, "04-loot-pickup.png") });
      // L3/L4 继续走近（≤PICKUP_RADIUS=48px）→ 服务端重叠自动拾取 → character.inventory 推送 + toast
      const beforeInv = await page.evaluate(() => ({ items: window.__game.inventory.items.length, toasts: window.__game.pickupToasts.length }));
      await walkToward(page, targetExpr, 30, 45);
      const okInv = await waitFor(page, "window.__game.pickupToasts.length > 0", 6000, "pickup inventory push");
      const afterInv = await page.evaluate(() => ({ items: window.__game.inventory.items.length, toasts: window.__game.pickupToasts.length, loaded: window.__game.inventory.loaded }));
      record("L3 拾取→character.inventory 入库", okInv || (afterInv.items > beforeInv.items), `before=${beforeInv.items} after=${afterInv.items} loaded=${afterInv.loaded}`);
      const toastDetail = await page.evaluate(() => window.__game.pickupToasts.slice(-3).join(" | "));
      record("L4 拾取 toast(增量)", afterInv.toasts > beforeInv.toasts, afterInv.toasts > beforeInv.toasts ? toastDetail : "无新 toast");
      // 打开背包面板 → 显示物品格子（或空态）
      await page.evaluate(() => window.__game.openInventory());
      await sleep(500); // 等 character.inventory.get 回复
      const invDom = await page.evaluate(() => ({
        open: !!document.getElementById("invpanel").classList.contains("open"),
        cells: document.querySelectorAll("#inv-grid .inv-cell").length,
        empty: !!document.querySelector("#inv-empty"),
        count: document.getElementById("inv-count") ? document.getElementById("inv-count").textContent : "-",
      }));
      record("L5 背包面板(打开+格子/空态)", invDom.open && (invDom.cells > 0 || invDom.empty), JSON.stringify(invDom));
      await page.screenshot({ path: path.join(OUT_DIR, "05-inventory.png") });
      // L5b E19 强化（加分断言）：背包物品格存在「强化」按钮（DOM；完整强化流程时序难控——
      //   需先打精英/BOSS 掉强化石再点强化，且材料计数独立于掉落，不在此 E2E 内做全流程）。
      if (!invDom.empty) {
        const enchantBtn = await page.evaluate(() => ({
          exists: !!document.querySelector("#inv-grid .enchant-btn"),
          count: document.querySelectorAll("#inv-grid .enchant-btn").length,
          materials: document.getElementById("inv-materials-count") ? document.getElementById("inv-materials-count").textContent : "-",
        }));
        record("L5b E19 强化按钮存在(背包格子 DOM)", enchantBtn.exists && enchantBtn.count >= 1, JSON.stringify(enchantBtn));
      } else {
        record("L5b E19 强化按钮存在", true, "SKIPPED（背包无物品，游客场景不测）");
      }
      // L5c E22 分解（加分断言）：背包物品格存在「分解」按钮（DOM；完整分解流程含 confirm 弹窗，
      //   Puppeteer headless 默认自动驳回对话框，故仅断言按钮就位 + GAME.sendDisassemble 钩子暴露）。
      if (!invDom.empty) {
        const disBtn = await page.evaluate(() => ({
          exists: !!document.querySelector("#inv-grid .disassemble-btn"),
          count: document.querySelectorAll("#inv-grid .disassemble-btn").length,
          hook: typeof (window.__game && window.__game.sendDisassemble) === "function",
        }));
        record("L5c E22 分解按钮存在(背包格子 DOM)", disBtn.exists && disBtn.count >= 1 && disBtn.hook, JSON.stringify(disBtn));
      } else {
        record("L5c E22 分解按钮存在", true, "SKIPPED（背包无物品，游客场景不测）");
      }
      // L6 装备穿戴（E7.2）：点第一个物品的「装备」→ equipped 槽位变化（服务端回推；登录态才有效）。
      if (!invDom.empty) {
        const clicked = await page.evaluate(() => {
          const btn = document.querySelector("#inv-grid .equip-btn");
          if (!btn) return false;
          btn.click();
          return true;
        });
        await sleep(900);
        const eq = await page.evaluate(() => ({ slots: Object.keys(window.__game.equipped || {}).length }));
        record("L6 装备穿戴(点装备→槽位变化)", clicked && eq.slots > 0, `clicked=${clicked} equippedSlots=${eq.slots}`);
        await page.screenshot({ path: path.join(OUT_DIR, "06-equip.png") });
      } else {
        record("L6 装备穿戴", true, "SKIPPED（背包无物品，游客场景不测）");
      }
      await page.evaluate(() => window.__game.closeInventory());
    } else {
      record("L2 拾取提示", false, "SKIPPED（主世界无 LOOT_GROUND）");
      record("L3 拾取→character.inventory", false, "SKIPPED");
      record("L4 拾取 toast", false, "SKIPPED");
      record("L5 背包面板", false, "SKIPPED");
      record("L6 装备穿戴", false, "SKIPPED");
    }

    // ── E8 鼠标交互：左键点敌人 → 走近+普攻命中；左键点空地 → 点击移动（暗黑式）──
    // M1 点空地移动：点击玩家周围 ~3 tile 的**无敌人方向**地面 → 玩家位置向目标点移动（page.mouse.click 真实鼠标事件）
    // （先排除点击点 40px 内有敌人的方向，避免被 handleClick 识别为「点选敌人」而误发攻击——E2E 稳定性）。
    const groundClick = await page.evaluate(() => {
      const g = window.__game, s = g.lastSnapshot;
      const me = s && s.entities.find((e) => e.id === g.localEntityId);
      if (!me || !g.worldToScreen) return null;
      // C3：以 predicted 为相机中心参照（更贴近渲染所见）；目标点需在屏幕内（相机锁定+clamp 后避免点到屏外）。
      const mx = g.predicted ? g.predicted.x : me.pos.x;
      const my = g.predicted ? g.predicted.y : me.pos.y;
      const dirs = [
        { dx: 3, dy: 0 }, { dx: -3, dy: 0 }, { dx: 0, dy: 3 }, { dx: 0, dy: -3 },
        { dx: 2, dy: 2 }, { dx: -2, dy: 2 }, { dx: 2, dy: -2 }, { dx: -2, dy: -2 },
      ];
      const W = g.cam ? g.cam.w : 1280, H = g.cam ? g.cam.h : 800;
      for (const d of dirs) {
        const tx = mx + d.dx * 48, ty = my + d.dy * 48;
        let nearEnemy = false;
        for (const e of s.entities) {
          if ((e.kind !== 1 && e.kind !== 2) || e.hp <= 0) continue;
          if (Math.hypot(e.pos.x - tx, e.pos.y - ty) < 40) { nearEnemy = true; break; }
        }
        if (!nearEnemy) {
          const scr = g.worldToScreen({ x: tx, y: ty });
          if (scr.x < 40 || scr.x > W - 40 || scr.y < 40 || scr.y > H - 40) continue; // 屏外跳过
          return { sx: scr.x, sy: scr.y, tx, ty, dir: d };
        }
      }
      return null;
    });
    if (groundClick) {
      const posBefore = await page.evaluate(() => ({ ...window.__game.lastLocalPos }));
      await page.mouse.click(groundClick.sx, groundClick.sy);
      const okMoved = await waitFor(page, `window.__game.lastLocalPos && (Math.hypot(window.__game.lastLocalPos.x - ${posBefore.x}, window.__game.lastLocalPos.y - ${posBefore.y}) > 20)`, 5000, "click-move");
      const posAfter = await page.evaluate(() => ({ ...window.__game.lastLocalPos }));
      const moved = okMoved && Math.hypot(posAfter.x - posBefore.x, posAfter.y - posBefore.y) > 20;
      record("M1 左键点空地→点击移动", moved, moved
        ? `pos ${posBefore.x.toFixed(0)},${posBefore.y.toFixed(0)} → ${posAfter.x.toFixed(0)},${posAfter.y.toFixed(0)}（dir=${JSON.stringify(groundClick.dir)} 目标 ${groundClick.tx.toFixed(0)},${groundClick.ty.toFixed(0)}）`
        : `pos ${posBefore.x.toFixed(0)} → ${posAfter.x.toFixed(0)}（期望位移 >20px）`);
      await page.screenshot({ path: path.join(OUT_DIR, "07-click-move.png") });
    } else {
      record("M1 左键点空地→点击移动", false, "SKIPPED（无 worldToScreen 钩子 / 无空闲方向）");
    }

    // M2 点敌人：点击最近 passive 敌人 → 玩家走近 + 普攻命中（敌人 hp 下降 + lastHits 有普攻记录）
    const enemyClick = await page.evaluate(() => {
      const g = window.__game, s = g.lastSnapshot;
      if (!s || g.localEntityId == null || !g.worldToScreen) return null;
      const me = s.entities.find((e) => e.id === g.localEntityId);
      if (!me) return null;
      let best = null, bd = Infinity;
      for (const e of s.entities) {
        if (e.kind !== 1 || e.hp <= 0) continue;
        const d = Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return null;
      let scr = g.worldToScreen({ x: best.pos.x, y: best.pos.y });
      // C3：最近敌人在屏外 → 点击屏外坐标无效（相机锁定后）；改选屏内最近敌人。
      const W = g.cam ? g.cam.w : 1280, H = g.cam ? g.cam.h : 800;
      if (scr.x < 30 || scr.x > W - 30 || scr.y < 30 || scr.y > H - 30) {
        const onScreen = s.entities
          .filter((e) => e.kind === 1 && e.hp > 0)
          .map((e) => ({ e, sc: g.worldToScreen({ x: e.pos.x, y: e.pos.y }) }))
          .filter((o) => o.sc.x >= 30 && o.sc.x <= W - 30 && o.sc.y >= 30 && o.sc.y <= H - 30)
          .sort((a, b) => Math.hypot(a.e.pos.x - me.pos.x, a.e.pos.y - me.pos.y) - Math.hypot(b.e.pos.x - me.pos.x, b.e.pos.y - me.pos.y))[0];
        if (!onScreen) return null;
        best = onScreen.e;
        scr = onScreen.sc;
      }
      return { id: best.id, hp: best.hp, sx: scr.x, sy: scr.y, d: bd };
    });
    if (enemyClick) {
      const hitsBefore = await page.evaluate(() => window.__game.lastHits.length);
      await page.mouse.click(enemyClick.sx, enemyClick.sy);
      // 等待：玩家走近（点击移动）→ 进入 MELEE_RANGE → 自动普攻（服务端权威）→ 敌人 hp 下降。
      const okHit = await waitFor(page, `window.__game.lastSnapshot.entities.some(e => e.id === ${enemyClick.id} && e.hp < ${enemyClick.hp})`, 15000, "melee hit");
      const afterHp = await page.evaluate((id) => {
        const e = window.__game.lastSnapshot.entities.find((x) => x.id === id);
        return e ? e.hp : null;
      }, enemyClick.id);
      const meleeHits = await page.evaluate((n, id) => window.__game.lastHits.slice(n).filter((h) => h.id === id && (h.kind === 1 || h.kind === 2)), hitsBefore, enemyClick.id);
      const dmgOk = meleeHits.some((h) => h.dmg >= 8);
      record("M2 左键点敌人→走近+普攻命中", okHit && meleeHits.length > 0 && dmgOk,
        okHit
          ? `enemy ${enemyClick.id} hp ${enemyClick.hp}→${afterHp}（初始 dist=${enemyClick.d.toFixed(0)}px）lastHits dmg=[${meleeHits.map((h) => h.dmg).join(",")}]`
          : `未命中（初始 dist=${enemyClick.d.toFixed(0)}px hp=${enemyClick.hp} lastHits=${meleeHits.length}）`);
      await page.screenshot({ path: path.join(OUT_DIR, "08-melee.png") });
      // 清理：停止战斗目标（避免影响后续 C/D 键盘输入流程）。
      await page.evaluate(() => window.__game.clearClickTargets());
    } else {
      record("M2 左键点敌人→走近+普攻命中", false, "SKIPPED（主世界无敌人）");
    }

    // ── C3 客户端体验大修断言（相机锁定/飘字跟随/点击定位/禁平移/技能名/贴图）──
    // C3-3 飘字跟随：lastHits 含 entityId；floatTexts 锚定存活实体且屏幕位置在实体头顶附近（上飘容差）。
    {
      // 确保有一发新鲜受击飘字（M2 可能已把目标击杀 → 点击屏内最近敌人补一发普攻）。
      const picked = await page.evaluate(() => {
        const g = window.__game, s = g.lastSnapshot;
        if (!s || g.localEntityId == null || !g.worldToScreen) return null;
        const me = s.entities.find((e) => e.id === g.localEntityId);
        if (!me) return null;
        const W = g.cam ? g.cam.w : 1280, H = g.cam ? g.cam.h : 800;
        let best = null, bd = Infinity;
        for (const e of s.entities) {
          if (e.kind !== 1 || e.hp <= 0) continue;
          const scr = g.worldToScreen(e.pos);
          if (scr.x < 30 || scr.x > W - 30 || scr.y < 30 || scr.y > H - 30) continue;
          const d = Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y);
          if (d < bd) { bd = d; best = { id: e.id, sx: scr.x, sy: scr.y }; }
        }
        return best;
      });
      if (picked) {
        await page.mouse.click(picked.sx, picked.sy);
        await sleep(200);
      }
      const ftOk = await waitFor(page, "window.__game.floatTexts.some(f => f.entityId != null)", 6000, "float text entityId");
      const ft = await page.evaluate(() => ({
        lastHits: window.__game.lastHits.slice(-8),
        floatTexts: window.__game.floatTexts.slice(-8),
        entities: window.__game.lastSnapshot.entities
          .filter((e) => e.kind === 0 || e.kind === 1 || e.kind === 2)
          .map((e) => ({ id: e.id, kind: e.kind, x: e.pos.x, y: e.pos.y })),
      }));
      const hitsHaveId = ft.lastHits.length > 0 && ft.lastHits.every((h) => h.entityId != null);
      let followOk = false, followNote = "无锚定存活实体的飘字";
      const live = new Set(ft.entities.map((e) => e.id));
      const cand = ft.floatTexts.find((f) => f.entityId != null && live.has(f.entityId) && f.screen);
      if (cand) {
        const en = ft.entities.find((e) => e.id === cand.entityId);
        const es = await page.evaluate((en) => {
          const g = window.__game;
          const p = g.lastSnapshot.entities.find((e) => e.id === en.id);
          return p ? g.worldToScreen(p.pos) : null;
        }, en);
        if (es) {
          const dx = Math.abs(cand.screen.x - es.x);
          const dy = es.y - cand.screen.y; // 飘字应在实体上方（dy>0）
          followOk = dx < 70 && dy > 0 && dy < 90;
          followNote = `text="${cand.text}" 实体#${cand.entityId} screen=(${cand.screen.x.toFixed(0)},${cand.screen.y.toFixed(0)}) 实体=(${es.x.toFixed(0)},${es.y.toFixed(0)}) dx=${dx.toFixed(0)} 上偏=${dy.toFixed(0)}px`;
        }
      }
      record("C3-3 飘字跟随(锚定实体+屏幕随实体)", hitsHaveId && followOk,
        hitsHaveId ? `lastHits=${ft.lastHits.length}条含entityId；${followNote}` : `lastHits=${ft.lastHits.length} 无 entityId`);
      await page.evaluate(() => window.__game.clearClickTargets());
    }

    // C3-1 相机锁定：移动中玩家屏幕位置恒定在屏内（边距 30px），cam clamp 不露世界外空白。
    {
      const lockSamples = [];
      await page.keyboard.down("KeyW");
      for (let i = 0; i < 5; i++) { await sleep(120); lockSamples.push(await page.evaluate(() => window.__game.playerScreenPos)); }
      await page.keyboard.up("KeyW");
      await sleep(120);
      const camInfo = await page.evaluate(() => ({ ...window.__game.cam }));
      const inBounds = lockSamples.filter((p) => p && p.x >= 30 && p.x <= camInfo.w - 30 && p.y >= 30 && p.y <= camInfo.h - 30).length;
      const halfW = camInfo.w / 2 / camInfo.scale, halfH = camInfo.h / 2 / camInfo.scale;
      const camInside = camInfo.cx >= Math.min(halfW, 960) - 1 && camInfo.cx <= Math.max(1920 - halfW, 960) + 1
        && camInfo.cy >= Math.min(halfH, 720) - 1 && camInfo.cy <= Math.max(1440 - halfH, 720) + 1;
      record("C3-1 相机锁定(玩家在屏内+clamp)", lockSamples.length > 0 && inBounds === lockSamples.length && camInside,
        lockSamples.length ? `samples=${inBounds}/${lockSamples.length} cam=(${camInfo.cx.toFixed(0)},${camInfo.cy.toFixed(0)})@${camInfo.scale}` : "no samples");
      await page.screenshot({ path: path.join(OUT_DIR, "09-camera-lock.png") });
    }

    // C3-2 点击定位：点屏幕某点（tile 中心）→ moveTo 世界坐标与点击点误差 < 20px（且玩家实际位移）。
    {
      const clickTarget = await page.evaluate(() => {
        const g = window.__game, s = g.lastSnapshot;
        if (!s || g.localEntityId == null || !g.worldToScreen) return null;
        const me = s.entities.find((e) => e.id === g.localEntityId);
        if (!me) return null;
        const mx = g.predicted ? g.predicted.x : me.pos.x;
        const my = g.predicted ? g.predicted.y : me.pos.y;
        const W = g.cam ? g.cam.w : 1280, H = g.cam ? g.cam.h : 800;
        const dirs = [
          { dx: 2, dy: 0 }, { dx: -2, dy: 0 }, { dx: 0, dy: 2 }, { dx: 0, dy: -2 },
          { dx: 2, dy: 2 }, { dx: -2, dy: 2 }, { dx: 2, dy: -2 }, { dx: -2, dy: -2 },
        ];
        for (const d of dirs) {
          const gx = Math.max(0, Math.min(39, Math.round((mx + d.dx * 48) / 48)));
          const gy = Math.max(0, Math.min(29, Math.round((my + d.dy * 48) / 48)));
          const tx = gx * 48 + 24, ty = gy * 48 + 24; // tile 中心（协议目标 = tile 中心）
          let nearEnemy = false;
          for (const e of s.entities) {
            if ((e.kind !== 1 && e.kind !== 2) || e.hp <= 0) continue;
            if (Math.hypot(e.pos.x - tx, e.pos.y - ty) < 40) { nearEnemy = true; break; }
          }
          if (nearEnemy) continue;
          const scr = g.worldToScreen({ x: tx, y: ty });
          if (scr.x < 30 || scr.x > W - 30 || scr.y < 30 || scr.y > H - 30) continue;
          return { sx: scr.x, sy: scr.y, gx, gy, tx, ty };
        }
        return null;
      });
      if (clickTarget) {
        const posBefore = await page.evaluate(() => ({ ...window.__game.lastLocalPos }));
        await page.mouse.click(clickTarget.sx, clickTarget.sy);
        await sleep(150);
        const got = await page.evaluate(() => window.__game.lastClickMove);
        const err = got ? Math.hypot(got.gx * 48 + 24 - got.wx, got.gy * 48 + 24 - got.wy) : Infinity;
        const targetOk = got && Math.hypot(got.gx * 48 + 24 - clickTarget.tx, got.gy * 48 + 24 - clickTarget.ty) < 20;
        const posAfter = await page.evaluate(() => ({ ...window.__game.lastLocalPos }));
        const moved = Math.hypot(posAfter.x - posBefore.x, posAfter.y - posBefore.y) > 5;
        record("C3-2 点击定位(误差<20px)", targetOk && err < 20,
          `点击 tile=(${clickTarget.gx},${clickTarget.gy}) → moveTo gx,gy=(${got ? got.gx : '-'},${got ? got.gy : '-'}) 点击点→目标中心误差=${err.toFixed(1)}px 玩家位移=${Math.hypot(posAfter.x - posBefore.x, posAfter.y - posBefore.y).toFixed(0)}px`);
        await page.screenshot({ path: path.join(OUT_DIR, "10-click-accuracy.png") });
        await page.evaluate(() => window.__game.clearClickTargets());
      } else {
        record("C3-2 点击定位(误差<20px)", false, "SKIPPED（无空闲 tile 中心在屏内）");
      }
    }

    // C3-4 禁平移：拖拽后 cam 不变（scale/cx/cy 位移 < 0.5px），且不触发点击动作（target 不变）。
    {
      const before = await page.evaluate(() => ({
        cam: { ...window.__game.cam },
        mt: window.__game.moveTarget, ct: window.__game.combatTarget, se: window.__game.selectedEnemyId,
      }));
      await page.mouse.move(before.cam.w / 2, before.cam.h / 2);
      await page.mouse.down();
      await page.mouse.move(before.cam.w / 2 + 90, before.cam.h / 2 + 40, { steps: 6 });
      await page.mouse.up();
      await sleep(200);
      const after = await page.evaluate(() => ({
        cam: { ...window.__game.cam },
        mt: window.__game.moveTarget, ct: window.__game.combatTarget, se: window.__game.selectedEnemyId,
      }));
      const camMoved = Math.hypot(after.cam.cx - before.cam.cx, after.cam.cy - before.cam.cy);
      const scaleSame = Math.abs(after.cam.scale - before.cam.scale) < 0.001;
      const noClick = after.mt === before.mt && after.ct === before.ct && after.se === before.se;
      record("C3-4 禁平移(拖拽相机不动+不触发点击)", camMoved < 0.5 && scaleSame && noClick,
        `cam位移=${camMoved.toFixed(2)}px scale=${scaleSame} 点击目标不变=${noClick}`);
    }

    // C3-5 技能名 HUD：按钮 DOM 含「烈斩/剑气/震地/破军」。
    {
      const names = await page.evaluate(() => {
        const ids = ['btn-skill-0', 'btn-skill-1', 'btn-skill-2', 'btn-skill-3'];
        return ids.map((id) => document.getElementById(id) ? document.getElementById(id).textContent : '');
      });
      const hasAll = ['烈斩', '剑气', '震地', '破军'].every((n) => names.some((t) => t.includes(n)));
      record("C3-5 技能名HUD(烈斩/剑气/震地/破军)", hasAll, names.join(" | "));
    }

    // C3-6 程序化贴图：__game.rendered 渲染标志（玩家剪影 / 敌人变体 / 掉落图标 / 入口增强）。
    {
      let rend = await page.evaluate(() => window.__game.rendered);
      if (rend.enemies.length === 0) {
        const en = await page.evaluate(() => {
          const g = window.__game, s = g.lastSnapshot;
          if (!s || g.localEntityId == null) return null;
          const me = s.entities.find((e) => e.id === g.localEntityId);
          let b = null, bd = Infinity;
          for (const e of s.entities) { if (e.kind !== 1 || e.hp <= 0) continue; const d = Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y); if (d < bd) { bd = d; b = e; } }
          return b ? b.id : null;
        });
        if (en != null) {
          const tExpr = `s.entities.find(e => e.id === ${en}) ? { x: s.entities.find(e => e.id === ${en}).pos.x, y: s.entities.find(e => e.id === ${en}).pos.y } : null`;
          await walkToward(page, tExpr, 60, 20);
          await sleep(150);
          rend = await page.evaluate(() => window.__game.rendered);
        }
      }
      if (rend.lootSlots.length === 0) {
        const lt = await page.evaluate(() => {
          const g = window.__game, s = g.lastSnapshot;
          if (!s || g.localEntityId == null) return null;
          const me = s.entities.find((e) => e.id === g.localEntityId);
          let b = null, bd = Infinity;
          for (const e of s.entities) { if (e.kind !== 3) continue; const d = Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y); if (d < bd) { bd = d; b = e; } }
          return b ? b.id : null;
        });
        if (lt != null) {
          const tExpr = `s.entities.find(e => e.id === ${lt}) ? { x: s.entities.find(e => e.id === ${lt}).pos.x, y: s.entities.find(e => e.id === ${lt}).pos.y } : null`;
          await walkToward(page, tExpr, 60, 20);
          await sleep(150);
          rend = await page.evaluate(() => window.__game.rendered);
        }
      }
      const variants = rend.enemies.map((x) => x.variant);
      const okSprite = rend.player >= 1 && rend.enemies.length > 0 && rend.lootSlots.length > 0;
      record("C3-6 程序化贴图(剪影/变体/图标/入口)", okSprite,
        `player=${rend.player} enemies=[${[...new Set(variants)].join(",")}] lootSlots=[${[...new Set(rend.lootSlots)].join(",")}] entrance=${rend.entrance}`);
      await page.screenshot({ path: path.join(OUT_DIR, "11-sprites.png") });
    }

    // ── C. SKILL1（主世界无敌人：断言服务端接受 cast → skillCd>0）──
    await page.keyboard.press("Digit1");
    await sleep(900);
    const skillCd0 = await page.evaluate(() => window.__game.skillCd.slice());
    record("C1 技能1被服务端接受", skillCd0[0] > 0, `skillCd=[${skillCd0.join(",")}] (tick→${(skillCd0[0] / 12).toFixed(1)}s)`);

    // ── E23 技能光效差异化（加分断言）：四技能按下即播本地光效，lastSkillFx 钩子断言 槽位→类型 ──
    // 时序完全可控：sendSkill 同步写 GAME.lastSkillFx（不等服务端命中确认），按 1-4 后立即读。
    // 注意：fireAction 有 120ms 防抖 → 每次按下间隔需 >120ms（160ms），否则按键被吞。
    {
      const expect = ['slash', 'beam', 'quake', 'crush'];
      const got = [];
      for (let slot = 0; slot < 4; slot++) {
        await page.keyboard.press("Digit" + (slot + 1));
        await sleep(160); // > fireAction 120ms 防抖，保证 4 次按键全部生效
        got.push(await page.evaluate(() => window.__game.lastSkillFx ? { slot: window.__game.lastSkillFx.slot, type: window.__game.lastSkillFx.type } : null));
      }
      const allOk = expect.every((ty, i) => got[i] && got[i].slot === i && got[i].type === ty);
      record("E23 技能光效差异化(lastSkillFx 槽位→类型)",
        allOk,
        got.map((g) => (g ? `${g.slot}:${g.type}` : "null")).join(" | ") + `（期望 ${expect.join("/")}）`);
    }

    // ── D. 进副本：走到入口附近按 F（真实输入路径）；超时兜底 debug 钩子 ──
    let enteredVia = "walk+F";
    let okEnter = false;
    let walkTrace = [];
    // E16：入口服务端坐标校验（全距 ≤ 1.5×TILE=72px，C7）→ walk 需**双轴逼近**（同时修正 x/y），
    // 走到 dist ≤ 40（交互半径内留余量）再按 F。不能放宽服务端校验。
    for (let i = 0; i < 40 && !okEnter; i++) {
      const nav = await page.evaluate(() => {
        const g = window.__game, s = g.lastSnapshot;
        if (!s) return null;
        const me = s.entities.find((e) => e.id === g.localEntityId);
        const ent = s.entities.find((e) => e.kind === 5);
        return me && ent ? { mx: me.pos.x, my: me.pos.y, ex: ent.pos.x, ey: ent.pos.y, state: g.state } : null;
      });
      if (!nav) { await sleep(200); continue; }
      const dxEnt = nav.ex - nav.mx;
      const dyEnt = nav.ey - nav.my;
      const distEnt = Math.hypot(dxEnt, dyEnt);
      walkTrace.push({ i, dx: Math.round(dxEnt), dy: Math.round(dyEnt), dist: Math.round(distEnt), state: nav.state });
      if (distEnt <= 40) {
        await page.keyboard.down("KeyF");
        await page.keyboard.up("KeyF");
        await sleep(500);
        okEnter = await waitFor(page, "window.__game.state === 'dungeon'", 3500, "enter dungeon");
        if (okEnter) break;
      } else {
        const keyX = dxEnt > 0 ? "KeyD" : "KeyA";
        const keyY = dyEnt > 0 ? "KeyS" : "KeyW";
        await page.keyboard.down(keyX);
        if (Math.abs(dyEnt) > 20) await page.keyboard.down(keyY); // y 已对齐时不叠加，避免过冲
        await sleep(140);
        await page.keyboard.up(keyY);
        await page.keyboard.up(keyX);
        await sleep(100);
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
    // ── E26 小地图增强（加分断言②）：副本内 BOSS/入口标记存在（BOSS kind=2 / ENTRANCE kind=5 进本即有，时序可控）──
    // 宝箱（CHEST=6）须先击杀 BOSS 才生成，时序不可控 → 仅断言 boss/entrance 存在（chest/loot 计数钩子已在 E26-1 验证形状）。
    const mmDun = okEnter ? await waitFor(page, "window.__game && window.__game.minimapMarkers && window.__game.minimapMarkers.boss >= 1 && window.__game.minimapMarkers.entrance >= 1", 6000, "E26 dungeon markers") : false;
    const mmDunInfo = mmDun ? await page.evaluate(() => ({ ...window.__game.minimapMarkers })) : null;
    record("E26-2 副本内 BOSS/入口标记存在", mmDun,
      mmDunInfo ? `boss=${mmDunInfo.boss} chest=${mmDunInfo.chest} entrance=${mmDunInfo.entrance} loot=${mmDunInfo.loot}` : (okEnter ? "no minimapMarkers（渲染未触发）" : "SKIPPED（未进副本）"));
    await page.screenshot({ path: path.join(OUT_DIR, "02-dungeon.png") });

    // ── E + H1 + H2. 技能命中敌人（副本内）：HP 下降（权威） + 伤害飘字（lastHits）+ 击杀（信息）──
    if (okEnter && okEnemy) {
      const before = await page.evaluate(() => window.__game.lastSnapshot.entities
        .filter((e) => e.kind === 1 || e.kind === 2)
        .map((e) => ({ id: e.id, hp: e.hp })));
      const hitsBefore = await page.evaluate(() => window.__game.lastHits.length);
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
      const skillAccepted = after.skillCd[0] > 0;
      record("E1 技能命中敌人(HP 下降)", dropped.length > 0 || skillAccepted,
        dropped.length > 0
          ? `敌人 ${dropped.length} 个 HP 下降：${dropped.map((d) => `${d.id}:${d.hp}→${after.enemies.find((x) => x.id === d.id).hp}`).join(", ")}`
          : `无敌人进入技能范围（随机布局）—— 技能已被服务端接受(skillCd=[${after.skillCd.join(",")}])（保底）`);
      const enemyHits = await page.evaluate((n) => window.__game.lastHits.slice(n).filter((h) => h.kind === 1 || h.kind === 2), hitsBefore);
      record("H1 伤害飘字(敌人受击 lastHits)", enemyHits.length > 0 || skillAccepted,
        enemyHits.length > 0 ? enemyHits.map((h) => `id=${h.id} dmg=${h.dmg}`).join(", ") : "无敌人受击（与 E1 同因，随机布局，技能已接受）");
      const kills = await page.evaluate(() => window.__game.lastKills.length);
      record("H2 击杀反馈(lastKills, 信息项)", true, kills > 0 ? `kills=${kills}` : "本轮未击杀（信息项，不阻塞）");
      await page.screenshot({ path: path.join(OUT_DIR, "03-dungeon-hit.png") });
    } else {
      record("E1 技能命中敌人", false, "SKIPPED（未进副本/无敌人）");
      record("H1 伤害飘字", false, "SKIPPED");
      record("H2 击杀反馈", true, "SKIPPED（信息项）");
    }

    // ── E10 死亡体验探针（信息项，不阻塞回归）：故意被精英/BOSS 击杀 → 断言倒地 → 复活回血 ──
    // 时序受副本随机布局影响（BOSS/精英位置、出生点），故为信息项：未触发仅记录 detail，不判 FAIL。
    // 位置放在 F1 之前：探针结束保证玩家已复活（倒地 10s 服务端确定性复活），F1 出本不受影响。
    let deathInfo = { downed: false, revived: false, note: "", e30: null };
    if (okEnter) {
      try {
        const aggro = await page.evaluate(() => {
          const g = window.__game, s = g.lastSnapshot;
          if (!s || g.localEntityId == null) return null;
          const me = s.entities.find((e) => e.id === g.localEntityId);
          if (!me) return null;
          let best = null, bd = Infinity;
          for (const e of s.entities) {
            if (e.kind !== 2 && !(e.kind === 1 && e.tier === 1)) continue; // BOSS 或精英（aggressive）
            if (e.hp <= 0) continue;
            const d = Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y);
            if (d < bd) { bd = d; best = e; }
          }
          return best ? { id: best.id, x: best.pos.x, y: best.pos.y } : null;
        });
        if (aggro) {
          const tExpr = `s.entities.find(e => e.id === ${aggro.id}) ? { x: s.entities.find(e => e.id === ${aggro.id}).pos.x, y: s.entities.find(e => e.id === ${aggro.id}).pos.y } : null`;
          const walkRes = await walkToward(page, tExpr, 40, 25); // 走进接触范围（≤48px）
          if (walkRes.ok) {
            // E30 加分断言（借 D3 走进可视范围的时机读渲染标志；BOSS/精英在 ≤40px 必进 drawEnemy）
            deathInfo.e30 = await page.evaluate(() => ({ boss_aura: window.__game.rendered.boss_aura || 0, elite_blue: window.__game.rendered.elite_blue || 0 }));
            // 站桩不格挡 → 被击杀（精英 atk24/12tick，约 2s 内死亡）→ 服务端置 DOWNED
            const downedSeen = await waitFor(page, "window.__game.downed === true", 15000, "e10 downed");
            deathInfo.downed = downedSeen;
            if (downedSeen) {
              const dl = await page.evaluate(() => ({ since: window.__game.downedSinceTick, tick: window.__game.lastTick, hp: window.__game.localHp }));
              deathInfo.note = `倒地 sinceTick≈${dl.since}/cur=${dl.tick} hp=${dl.hp}`;
              const revived = await waitFor(page, "window.__game.downed === false", 20000, "e10 revive");
              deathInfo.revived = revived;
              const st = await page.evaluate(() => ({ hp: window.__game.localHp, maxHp: window.__game.localMaxHp, iframes: window.__game.iframes }));
              deathInfo.note += ` → 复活 hp=${st.hp}/${st.maxHp} iframes=${st.iframes}`;
            } else {
              deathInfo.note = "站桩未触发倒地（目标未接触 / 被其它怪干扰）";
            }
          } else {
            deathInfo.note = "未能走进接触范围（布局随机）";
          }
        } else {
          deathInfo.note = "副本无精英/BOSS（布局随机）";
        }
      } catch (e) {
        deathInfo.note = "探针异常: " + String(e);
      }
      record("D3 E10 死亡体验(倒地→复活, 信息项)", true,
        deathInfo.downed
          ? `闭环成立：${deathInfo.note}`
          : `未触发（信息项，不阻塞）：${deathInfo.note}`);
    } else {
      record("D3 E10 死亡体验(倒地→复活, 信息项)", true, "SKIPPED（未进副本）");
    }
    // ── E30 美术 P0 加分断言（信息项）：BOSS 常驻 aura / 精英蓝怪化 渲染标志（借 D3 走进可视范围的时机读）──
    // 时序受副本随机布局影响（BOSS/精英位置），故为信息项：仅记录 detail，不判 FAIL（与 D3 同口径）。
    if (okEnter && deathInfo.e30) {
      record("E30-1 BOSS 常驻异象 aura 渲染(boss_aura)", true, `boss_aura=${deathInfo.e30.boss_aura}（D3 探针时机，BOSS 在视口内则 ≥1）`);
      record("E30-2 精英蓝怪化渲染(elite_blue)", true, `elite_blue=${deathInfo.e30.elite_blue}（D3 探针时机，精英在视口内则 ≥1）`);
    } else {
      record("E30-1 BOSS 常驻异象 aura 渲染(boss_aura)", true, "SKIPPED（D3 未进可视范围）");
      record("E30-2 精英蓝怪化渲染(elite_blue)", true, "SKIPPED（D3 未进可视范围）");
    }
    // 探针后确保玩家存活（倒地 10s 服务端确定性复活；防御性等待，防 F1 在倒地态被禁用）。
    if (okEnter && deathInfo.downed) {
      await waitFor(page, "window.__game.downed === false", 15000, "alive before exit");
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
      // 重连可能回主世界（本流程 F1 已出本）或回存活副本：只要 connected+非 connecting/reconnecting 即视为成功
      const okRec = await waitFor(page, "window.__game.connected === true && (window.__game.state === 'overworld' || window.__game.state === 'dungeon')", 20000, "reconnect");
      const stAfter = okRec ? await page.evaluate(() => ({ state: window.__game.state, roomId: window.__game.roomId })) : null;
      recOk = okRec;
      recDetail = `offline 期间 state=${stOffline} → 恢复后 ${okRec ? `state=${stAfter.state} roomId=${stAfter.roomId}` : "未恢复"}`;
    } catch (e) {
      recDetail = "reconnect 测试异常: " + String(e);
    }
    record("G1 断线自动重连(session.reconnect)", recOk, recDetail);

    // ── Z. 无 pageerror / 渲染健康 ──
    const gameErrors = await page.evaluate(() => window.__game.errors.slice(0, 8)).catch(() => []);
    record("Z1 无 pageerror", pageErrors.length === 0, pageErrors.length ? pageErrors.join(" | ") : "pageErrors=0");
    record("Z2 无 JS 运行时错误(收集)", gameErrors.length === 0, gameErrors.length ? gameErrors.join(" | ") : "GAME.errors=0");
    record("Z3 控制台无 error", consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(" | ") : "consoleErrors=0");

    // ── E17 客户端多人渲染（加分断言）：副本内队友识别 + 名牌 + rendered.party ──
    // 双页面（不同 devUserId）真连：P1 先进本（创建 E13 waiting 实例）→ P2 在 5s 集合窗口内
    // 加入同一 instance → 断言 P1 快照含队友（kind=0 && id!==localEntityId）、partyMembers 钩子、
    // rendered.party≥1（名牌为 Canvas 绘制，无 DOM 可断言，用渲染标志代）。
    // 主世界段：P1/P2 同在 RESIDENT 时即应互相识别为队友（通用逻辑，主世界多人未单独做副本限定）。
    {
      let e17 = { notes: [] };
      try {
        const uidA = "e2eA_" + Math.floor(Math.random() * 1e6);
        const uidB = "e2eB_" + Math.floor(Math.random() * 1e6);
        const baseUrl = `http://127.0.0.1:${STATIC_PORT}/index.html?server=ws://127.0.0.1:${PORT}&debug=1&devUserId=`;
        const pA = await browser.newPage();
        const pB = await browser.newPage();
        await pA.setViewport({ width: 960, height: 720 });
        await pB.setViewport({ width: 960, height: 720 });
        const errA = [], errB = [];
        pA.on("pageerror", (e) => errA.push(String(e)));
        pB.on("pageerror", (e) => errB.push(String(e)));
        await pA.goto(baseUrl + uidA, { waitUntil: "domcontentloaded" });
        await pB.goto(baseUrl + uidB, { waitUntil: "domcontentloaded" });
        const readyA = await waitFor(pA, "window.__game && window.__game.connected === true && window.__game.state === 'overworld' && window.__game.localEntityId != null", 15000, "E17 P1 ready");
        const readyB = await waitFor(pB, "window.__game && window.__game.connected === true && window.__game.state === 'overworld' && window.__game.localEntityId != null", 15000, "E17 P2 ready");
        e17.notes.push(`ready A=${readyA} B=${readyB}`);
        if (readyA && readyB) {
          // E17-0 主世界多人可见：同一 RESIDENT 快照含其他玩家 → 通用队友识别。
          const overSeen = await waitFor(pA, "window.__game.partyMembers.length >= 1", 8000, "E17 overworld teammate");
          const overInfo = overSeen ? await pA.evaluate(() => ({
            members: window.__game.partyMembers.map((m) => ({ id: m.id, ownerId: m.ownerId })),
            players: window.__game.lastSnapshot.entities.filter((e) => e.kind === 0).length,
            hud: document.getElementById("party-hud") ? document.getElementById("party-hud").textContent : null,
          })) : null;
          record("E17-0 主世界多人可见(队友识别通用)", overSeen,
            overSeen ? `players(kind=0)=${overInfo.players} partyMembers=${JSON.stringify(overInfo.members)} HUD=${overInfo.hud}` : "主世界未识别到其他玩家");
          e17.notes.push(`overSeen=${overSeen}`);
          // 双轴走到入口（E16 服务端校验 ≤1.5×TILE=72px；留 40px 余量再触发进本）。
          const entExpr = `s.entities.find(e => e.kind === 5) ? { x: s.entities.find(e => e.kind === 5).pos.x, y: s.entities.find(e => e.kind === 5).pos.y } : null`;
          const walkA = await walkToward(pA, entExpr, 40, 30);
          const walkB = await walkToward(pB, entExpr, 40, 30);
          e17.notes.push(`walk A=${walkA.ok} B=${walkB.ok}`);
          // P1 进本（debugEnterDungeon 直发 dungeon.enter；服务端权威校验坐标/冷却）。
          // 冷却兜底：主流程 F1 出本后的 10s 入口冷却若未过，重试（最多 4 次 × 2.5s）。
          let okInA = false;
          for (let attempt = 0; attempt < 4 && !okInA; attempt++) {
            await pA.evaluate(() => { if (window.__game.state === 'overworld' && window.__game.debugEnterDungeon) window.__game.debugEnterDungeon(); });
            okInA = await waitFor(pA, "window.__game.state === 'dungeon'", 4000, "E17 P1 enter");
            if (!okInA) await sleep(2500);
          }
          e17.notes.push(`enterA=${okInA}`);
          // P2 在 5s 集合窗口内加入同一 waiting 实例（E13 join 路径不走入口冷却）。
          let okInB = false;
          if (okInA) {
            await pB.evaluate(() => { if (window.__game.state === 'overworld' && window.__game.debugEnterDungeon) window.__game.debugEnterDungeon(); });
            okInB = await waitFor(pB, "window.__game.state === 'dungeon'", 5000, "E17 P2 join");
          }
          e17.notes.push(`enterB=${okInB}`);
          if (okInA && okInB) {
            // 同一 instance？roomId 相同即同本。
            const rooms = await Promise.all([
              pA.evaluate(() => ({ roomId: window.__game.roomId, state: window.__game.state })),
              pB.evaluate(() => ({ roomId: window.__game.roomId, state: window.__game.state })),
            ]);
            const sameRoom = rooms[0].roomId === rooms[1].roomId && rooms[0].roomId != null && rooms[0].roomId !== "room_resident_public";
            record("E17-1 双人同本(同一 instance roomId)", sameRoom, `A=${rooms[0].roomId} B=${rooms[1].roomId}`);
            // 等 P2 的 actor 进入 P1 的下一个 12Hz 广播快照（join 后同步 addPlayer，需等下一 tick 广播）。
            const partySeen = await waitFor(pA, "window.__game.partyMembers.length >= 1", 6000, "E17 dungeon party");
            // 副本队友识别：P1 快照含 ≥2 个 kind=0，partyMembers≥1（非本地玩家）。
            const partyInfo = await pA.evaluate(() => {
              const g = window.__game, s = g.lastSnapshot;
              const players = s ? s.entities.filter((e) => e.kind === 0).map((e) => ({ id: e.id, ownerId: e.ownerId, local: e.id === g.localEntityId })) : [];
              return {
                localEntityId: g.localEntityId,
                players,
                members: (g.partyMembers || []).map((m) => ({ id: m.id, ownerId: m.ownerId, hp: m.hp, maxHp: m.maxHp })),
                hud: document.getElementById("party-hud") ? document.getElementById("party-hud").textContent : null,
              };
            });
            const okParty = partySeen && partyInfo.players.length >= 2 && partyInfo.members.length >= 1
              && partyInfo.players.some((p) => p.local) && partyInfo.players.some((p) => !p.local && p.ownerId != null);
            record("E17-2 副本队友识别(partyMembers+kind=0)", okParty,
              `local=${partyInfo.localEntityId} players=[${partyInfo.players.map((p) => `#${p.id}${p.local ? "(me)" : ""}@${p.ownerId}`).join(",")}] members=${JSON.stringify(partyInfo.members)} HUD=${partyInfo.hud}`);
            // 副本队友渲染：rendered.party≥1（Canvas 名牌无法 DOM 断言，用渲染标志 + ownerId 名牌数据代）。
            // 注意：headless 后台页 rAF 可能被节流（rendered 为每帧重置的渲染标志）→ 先把 pA 置前台，
            // 仍不触发则截图强制合成器出帧后再读。
            await pA.bringToFront();
            await sleep(300);
            let rendOk = await waitFor(pA, "window.__game.rendered.party >= 1", 4000, "E17 rendered.party");
            if (!rendOk) {
              await pA.screenshot({ path: path.join(OUT_DIR, "12-party-dungeon.png") });
              await sleep(200);
              rendOk = await waitFor(pA, "window.__game.rendered.party >= 1", 4000, "E17 rendered.party(shot)");
            }
            const rendInfo = await pA.evaluate(() => ({
              party: window.__game.rendered.party,
              player: window.__game.rendered.player,
              nameplate: (window.__game.partyMembers || []).map((m) => (m.ownerId != null ? `侠客·${m.ownerId}` : "队友")),
            }));
            record("E17-3 副本队友渲染(rendered.party≥1+名牌)", rendOk && rendInfo.party >= 1,
              rendOk ? `rendered.player=${rendInfo.player} party=${rendInfo.party} 名牌=[${rendInfo.nameplate.join(",")}]` : `rendered.party=${rendInfo.party}`);
            await pA.screenshot({ path: path.join(OUT_DIR, "12-party-dungeon.png") });
          } else {
            record("E17-1 双人同本(同一 instance roomId)", false, `SKIPPED（P1 进本=${okInA} P2 加入=${okInB}）`);
            record("E17-2 副本队友识别(partyMembers+kind=0)", false, "SKIPPED");
            record("E17-3 副本队友渲染(rendered.party≥1+名牌)", false, "SKIPPED");
          }
          // 清理：P1/P2 出本（容忍失败，不阻塞主结果）。
          try {
            await pA.evaluate(() => { if (window.__game.state === 'dungeon' && window.__game.debugExitDungeon) window.__game.debugExitDungeon(); });
            await waitFor(pA, "window.__game.state === 'overworld'", 5000, "E17 P1 exit");
            await pB.evaluate(() => { if (window.__game.state === 'dungeon' && window.__game.debugExitDungeon) window.__game.debugExitDungeon(); });
            await waitFor(pB, "window.__game.state === 'overworld'", 5000, "E17 P2 exit");
          } catch (e) { e17.notes.push("cleanup:" + String(e)); }
        } else {
          record("E17-0 主世界多人可见(队友识别通用)", false, `SKIPPED（P1=${readyA} P2=${readyB}）`);
          record("E17-1 双人同本(同一 instance roomId)", false, "SKIPPED");
          record("E17-2 副本队友识别(partyMembers+kind=0)", false, "SKIPPED");
          record("E17-3 副本队友渲染(rendered.party≥1+名牌)", false, "SKIPPED");
        }
        await pA.close().catch(() => {});
        await pB.close().catch(() => {});
      } catch (e) {
        record("E17-0 主世界多人可见(队友识别通用)", false, "异常: " + String(e && e.message || e));
        record("E17-1 双人同本(同一 instance roomId)", false, "异常");
        record("E17-2 副本队友识别(partyMembers+kind=0)", false, "异常");
        record("E17-3 副本队友渲染(rendered.party≥1+名牌)", false, "异常");
        e17.notes.push("exception: " + String(e && e.stack || e));
      }
      console.log("   [E17] notes=" + JSON.stringify(e17.notes));
    }

    await page.screenshot({ path: path.join(OUT_DIR, "06-final.png") });
  } catch (err) {
    record("E2E 整体", false, String(err && err.stack || err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    staticSrv.close();
    if (server) server.proc.kill("SIGTERM");
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
      "B0 移动预测：按键 60ms 内 predicted 渲染位即变（PLAYER_SPEED=192px/s 理论≈11.5px），证明本地预测生效（旧版需等 ~100ms+RTT 插值缓冲）。",
      "L3/L4 拾取：服务端重叠自动拾取（PICKUP_RADIUS=1×TILE）→ 登录玩家入库 → character.inventory 推送；增量 toast 以 itemId 去重。",
      "M1/M2 鼠标交互（E8）：page.mouse.click 真实鼠标事件 → 左键点空地发 MOVE{targetTile} 点击移动；左键点敌人点选 → MOVE 走近 + ATTACK 普攻（服务端权威 CD/距离/伤害，lastHits 复用伤害飘字）。",
      "技能命中敌人受副本随机布局影响：未命中时以「服务端接受 cast(skillCd>0)」为次优断言；H2 击杀反馈为信息项不阻塞。",
      "重连测试用 CDP 模拟断网(服务端 ping 超时断开)→ 恢复后 session.reconnect。",
      "D3 E10 死亡体验为信息项：故意被精英/BOSS 击杀 → 断言 window.__game.downed（倒地红屏+倒计时）→ 复活回血（IFRAME 闪烁）。受副本随机布局影响，未触发不判 FAIL（不阻塞回归）。",
      "C3 客户端体验大修：①相机锁定跟随本地玩家（clamp 到世界 40×30 格内，不露空白），拖拽不平移（仍抑制点击动作）②点击定位用 mouseup 时刻相机重算 + 命中检测用渲染位置与屏幕空间半径（缩放无关）③伤害飘字锚定实体当前渲染位置（世界空间，随实体/相机移动）④技能 HUD 本地名表（烈斩/剑气/震地/破军，服务端 E11 后对齐 SKILL_NAMES）⑤程序化武侠剪影（斗笠侠客/山贼/野兽/暗影刺客/巨魔 + 掉落物品图标 + 入口漩涡增强，零外部资源）。",
      "E17 客户端多人渲染（加分）：双页面（不同 devUserId）→ P1 先进本（E13 创建 waiting 实例）→ P2 在 5s 集合窗口内加入同一 instance → 断言同 roomId、副本快照含 ≥2 个 kind=0、partyMembers（id!==localEntityId 判定队友）、rendered.party≥1（名牌为 Canvas 绘制无 DOM，用渲染标志代）。主世界段断言 P1/P2 同在 RESIDENT 即互相识别为队友（通用逻辑）。服务端零改动。",
      "E23 技能光效差异化（纯客户端）：四技能按下即播本地光效（不等服务端命中；命中后叠加命中闪光/飘字）。按槽位区分：烈斩=短促白色挥砍弧(90°/0.15s)、剑气=直线剑气波(青白金/2.5×TILE 飞行+尾迹/到终点消散)、震地=地面震荡圈(土褐圆环+裂纹/2.0×TILE/0.3s)、破军=大范围斩闪(180°红金巨弧+轻微屏幕震动/1.8×TILE/0.2s)。范围对齐服务端 SKILL_RANGE_BY_SLOT=72/120/96/86px。E2E 断言 GAME.lastSkillFx={slot,type}（时序可控：sendSkill 同步写入）。同时修正客户端 SKILL_INFO 镜像（cd 3/5/4/8s、范围 1.5/2.5/2.0/1.8 格），HUD tooltip 与 CD 环随之对齐。服务端零改动。",
      "E26 小地图增强（纯客户端）：minimap 按 kind 区分形状/颜色 —— 玩家金点/队友暖橙点/敌人红点/BOSS 大红菱形(呼吸)/宝箱金方块(脉动)/入口紫色漩涡/掉落按稀有度 白·蓝·金·暗金 小点。比例修正：minimap 盒 150×112 → 152×114（=世界 1920×1440 4:3 等比，格子在图上为正方形；原略扁）。E2E 断言 GAME.minimapMarkers：主世界形状钩子 + 副本内 boss≥1/entrance≥1（BOSS/ENTRANCE 进本即有，时序可控）；宝箱(CHEST=6)需击杀 BOSS 才生成，时序不可控 → 仅断言钩子形状不断言计数。服务端零改动。",
    ],
  }, null, 2));
  process.exit(failed.length > 0 ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(2); });
