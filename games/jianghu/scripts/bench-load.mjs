#!/usr/bin/env node
/**
 * bench-load.mjs — E25 性能压测与瓶颈分析 · headless 并发压测台（jianghu）
 * ===========================================================================
 * 目的：量化「多少人同时在线会卡」。模拟 N 个并发玩家连接**真实服务端**，
 *       room.join → 持续收二进制快照（12Hz）→ 每 100ms 发 MOVE（活动玩家），
 *       测量：快照到达率 / 端到端 RTT / 服务端 CPU% / 服务端 RSS。
 *
 * 判定（卡顿阈值）：到达率 < 90% 或 RTT p95 > 500ms → 该 N 视为「卡顿阈值」。
 *
 * 运行方式（默认自起服务端，:3011）：
 *   node --experimental-strip-types scripts/bench-load.mjs --n 10,30,60,100
 *   node --experimental-strip-types scripts/bench-load.mjs --n 10,30,60,100,150,200,300 --duration 15000
 * 连外部已运行服务端（不做服务端资源采样）：
 *   node --experimental-strip-types scripts/bench-load.mjs --n 100 --no-server --port 3011
 *
 * 服务端资源采样（--server 默认模式）：用 inline wrapper 起服务端子进程，
 *   子进程内每 1s 自报 process.cpuUsage() 增量 + memoryUsage().rss（**不依赖 ps**，
 *   macOS/CI 沙箱均可）；父进程聚合测量窗口内的均值/峰值。
 *
 * 纪律：
 *   - 纯运行时压测，不触碰 310 测试 / playtest golden（D9 确定性不涉运行时性能）。
 *   - DEV_SKIP_AUTH（devUserId 注入身份），不触 api2。
 *   - 压测结束后 kill 服务端子进程；不 commit（主理人验证后提交）。
 *
 * 输出：控制台表格 + 可选 --out <json> 原始数据（供 bench-report.md 汇总）。
 */

import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import WebSocket from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../apps/jianghu");
const SERVER_URL = resolve(APP, "src/server.ts");

// ───────────────────────────────────────────── 命令行 ─────────────────────────────────────────────
function parseArgs(argv) {
  const args = { n: [10, 30, 60, 100], duration: 15000, warmup: 5000, port: 3011, server: true, out: null, rttInterval: 2500, stagger: 25 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === "--n") args.n = String(val()).split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
    else if (a === "--duration") args.duration = Number(val());
    else if (a === "--warmup") args.warmup = Number(val());
    else if (a === "--port") args.port = Number(val());
    else if (a === "--no-server") args.server = false;
    else if (a === "--out") args.out = val();
    else if (a === "--rtt-interval") args.rttInterval = Number(val());
    else if (a === "--stagger") args.stagger = Number(val());
    else if (a === "--help" || a === "-h") { console.log(usage()); process.exit(0); }
  }
  return args;
}
function usage() {
  return [
    "bench-load.mjs — jianghu E25 并发压测",
    "  --n <list>          并发连接数列表（默认 10,30,60,100）",
    "  --duration <ms>     测量窗口（默认 15000）",
    "  --warmup <ms>       全员入房后预热（默认 5000）",
    "  --port <port>       服务端口（默认 3011）",
    "  --no-server         连外部已运行服务端（不做资源采样）",
    "  --out <json>        原始数据落盘（供报告汇总）",
    "  --rtt-interval <ms> 每连接 RTT 采样间隔（默认 2500）",
    "  --stagger <ms>      连接错峰间隔（默认 25，防惊群）",
  ].join("\n");
}

// ───────────────────────────────────────────── 服务端子进程（自起模式）─────────────────────────────────────────────
const WRAPPER_TEMPLATE = (serverUrl) => `
import { startServer } from ${JSON.stringify(serverUrl)};
const port = Number(process.env.PORT || 3011);
const srv = await startServer(port);
console.log("[bench-server] listening " + srv.port);
let prev = process.cpuUsage();
let prevT = Date.now();
const timer = setInterval(() => {
  try {
    const now = process.cpuUsage();
    const nowT = Date.now();
    const dt = (nowT - prevT) / 1000;
    const cpuPct = dt > 0 ? ((now.user + now.system - prev.user - prev.system) / 1e6) / dt * 100 : 0;
    prev = now; prevT = nowT;
    const mem = process.memoryUsage();
    console.log("[bench-server] STAT " + JSON.stringify({
      cpuPct: Math.round(cpuPct * 10) / 10,
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      external: mem.external,
      t: nowT,
    }));
  } catch {}
}, 1000);
timer.unref?.();
process.on("SIGTERM", () => { try { srv.close(); } catch {} setTimeout(() => process.exit(0), 50); });
process.on("SIGINT", () => { try { srv.close(); } catch {} setTimeout(() => process.exit(0), 50); });
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
`;

async function spawnServer(port) {
  const wrapper = WRAPPER_TEMPLATE(pathToFileURL(SERVER_URL).href);
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", wrapper], {
    env: { ...process.env, PORT: String(port), DEV_SKIP_AUTH: "true", JIANGHU_JSON_STORE_DIR: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stats = []; // {cpuPct, rss, t}
  let listening = false;
  let stderrBuf = "";
  child.stdout?.on("error", () => {});
  child.stderr?.on("error", () => {});
  const listenReady = new Promise((resolveReady, rejectReady) => {
    const to = setTimeout(() => rejectReady(new Error("server start timeout")), 15000);
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      for (const line of text.split("\n")) {
        if (line.startsWith("[bench-server] listening")) {
          listening = true;
          clearTimeout(to);
          resolveReady();
        } else if (line.startsWith("[bench-server] STAT ")) {
          try { stats.push(JSON.parse(line.slice("[bench-server] STAT ".length))); } catch { /* ignore */ }
        }
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.includes("EADDRINUSE")) {
        clearTimeout(to);
        rejectReady(new Error("server failed to start: port in use — " + stderrBuf.slice(-300)));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(to);
      if (!listening) rejectReady(new Error(`server exited early (code=${code}): ${stderrBuf.slice(-500)}`));
    });
  });
  await listenReady;
  return { child, stats };
}

// ───────────────────────────────────────────── 二进制快照最小解码 ─────────────────────────────────────────────
// 帧格式：[msgType:u8=0x01][tick:u32][entityCount:u16] + 每实体 [id:u16][mask:u16] + 条件序列化字段。
// 本解码仅做「跳过 + 找自己实体（ownerId==seatId）」—— 偏移必须与 protocol-binary.encodeEntity 完全一致。
const BIT = {
  POS: 1 << 0, KIND: 1 << 1, DIR: 1 << 2, VITALS: 1 << 3, STATUS_EFFECTS: 1 << 4,
  OWNER: 1 << 5, PARRY: 1 << 6, LOOT: 1 << 7, TELEGRAPH: 1 << 8,
  ENTRANCE: 1 << 9, TIER: 1 << 10, SKILL_CD: 1 << 11, ATTRS: 1 << 12,
};

/** 解码一帧；返回 { tick, count, self:{id,x,y}|null }（self = 属于本 seat 的玩家实体）。 */
function decodeFrame(buf, seatId) {
  let off = 0;
  const msgType = buf[off++]; // u8
  if (msgType !== 0x01) return { tick: 0, count: 0, self: null, invalid: true };
  const tick = buf.readUInt32LE(off); off += 4;
  const count = buf.readUInt16LE(off); off += 2;
  let self = null;
  for (let i = 0; i < count; i++) {
    const id = buf.readUInt16LE(off); off += 2;
    const mask = buf.readUInt16LE(off); off += 2;
    // 无条件核心字段
    const x = buf.readInt16LE(off); off += 2;
    const y = buf.readInt16LE(off); off += 2;
    off += 1; // kind
    off += 1; // dir
    off += 2; // hp
    off += 2; // maxHp
    off += 2; // status
    const seCount = buf[off++];
    for (let j = 0; j < seCount; j++) { off += 1 + 2; } // type u8 + remainingTicks u16
    // 条件字段（与 encodeEntity 顺序一致）
    if (mask & BIT.OWNER) {
      const owner = buf.readUInt16LE(off); off += 2;
      if (owner === seatId) self = { id, x, y };
    }
    if (mask & BIT.PARRY) { off += 1 + 4; } // active u8 + windowEndTick u32
    if (mask & BIT.LOOT) { off += 4 + 1; const ac = buf[off]; off += 1; off += ac + 2; } // itemId u32 + rarity u8 + affixCount u8 + affixes + ttlTicks u16
    if (mask & BIT.TELEGRAPH) { off += 1 + 1 + 4 + 4 + 2; } // shape u8 color u8 startTick u32 applyTick u32 radius u16
    if (mask & BIT.ENTRANCE) { off += 2 + 4; } // cooldownTicks u16 + lastUsedTick u32
    if (mask & BIT.TIER) { off += 1; } // tier u8
    if (mask & BIT.SKILL_CD) { off += 4 * 2; } // 4×u16
    if (mask & BIT.ATTRS) { off += 3; const hasExt = buf[off++]; if (hasExt) off += 6; } // str dex vit + hasExt + atk/maxHp/crit u16×3
  }
  return { tick, count, self };
}

/** packTile 镜像（world.packTile：gx*64+gy）。 */
function packTile(gx, gy) {
  return gx * 64 + gy;
}

/** InputAction.STOP = 7（RTT 探针先停走再测；types.ts 单一来源，此处镜像）。 */
const InputActionSTOP = 7;

// ───────────────────────────────────────────── 每连接压测客户端 ─────────────────────────────────────────────
class BenchClient {
  /**
   * @param idx    客户端序号（用于方向/目标确定性 + 身份）
   * @param url    ws://127.0.0.1:PORT/ws/jianghu?devUserId=...
   * @param opts   { duration, rttInterval }
   */
  constructor(idx, url, opts) {
    this.idx = idx;
    this.url = url;
    this.opts = opts;
    this.ws = null;
    this.seatId = null;
    this.frames = 0;
    this.droppedTicks = 0;
    this.lastTick = null;
    this.firstTick = null;
    this.lastFrameAt = 0;
    this.maxFrameGapMs = 0;
    this.rttSamples = [];
    this.measureStart = 0;
    this.measureEnd = 0;
    this.measuring = false;
    this.targetSwitchTimer = null;
    this.rttTimer = null;     // RTT 探针超时兜底
    this.moveTimer = null;    // 每 100ms MOVE
    this.seq = 1;
    this.target = this.pickTarget();
    this.lastTargetSentAt = 0;
    this.closed = false;
    this.textQueue = [];   // 控制面文本缓冲（连接创建即挂，防 session.ready 丢失竞态）
    this.textWaiters = [];
    this.textDrop = false; // 连接完成后丢弃控制面文本（room.snapshot 全房广播量大，不缓冲避免父进程 OOM）
    // RTT 探针状态机（只在探针窗口内解码帧，避免父进程 O(实体×连接) 解码成为测量瓶颈）
    this.probe = { active: false, phase: "stop", prevPos: null, sendAt: 0, timer: null };
    this.targetSwitchTimer = null;
    this.ready = new Promise((res) => { this._readyResolve = res; });
  }

  /** 确定性随机目标（中心区域避开四壁；不同客户端不同目标）。 */
  pickTarget() {
    const r = () => {
      // 线性同余，按 idx 播种（确定性，可复现）
      this._rng = (this._rng === undefined ? (this.idx * 2654435761 + 12345) : (this._rng * 1103515245 + 12345) & 0x7fffffff);
      return this._rng / 0x7fffffff;
    };
    const gx = 2 + Math.floor(r() * 35); // 2..36
    const gy = 2 + Math.floor(r() * 25); // 2..26
    return packTile(gx, gy);
  }

  async connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.binaryType = "nodebuffer";
    // 永久消息处理器：二进制 → 到达率/解码；文本 → 入队（缓冲，防 listener 注册竞态丢 session.ready）。
    ws.on("message", (data, isBinary) => {
      if (isBinary) { this.onMessage(data, true); return; }
      const w = this.textWaiters.shift();
      if (w) { try { w(JSON.parse(data.toString())); } catch { w(null); } }
      else if (!this.textDrop) { try { this.textQueue.push(JSON.parse(data.toString())); } catch { /* ignore */ } }
      // textDrop=true 后：连接已完成，控制面文本（如 room.snapshot）直接丢弃
    });
    ws.on("close", () => { this.closed = true; this.stopTimers(); });
    ws.on("error", () => { this.closed = true; this.stopTimers(); });
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });

    // session.ready 控制面（含 seatId）
    const ready = await this.nextText();
    if (ready?.type !== "session.ready") throw new Error(`client ${this.idx}: expected session.ready, got ${ready?.type}`);
    this.seatId = ready.seatId;
    // room.join → room.join.ok
    ws.send(JSON.stringify({ type: "room.join", requestId: `join${this.idx}` }));
    const joinOk = await this.nextText();
    if (joinOk?.type !== "room.join.ok") throw new Error(`client ${this.idx}: expected room.join.ok, got ${joinOk?.type}`);
    this.roomId = joinOk.roomId;
    // room.snapshot presence 广播（入房后第一条）
    await this.nextText(); // room.snapshot（尽力消费，避免阻塞）
    // 连接完成：清空缓冲 + 之后丢弃控制面文本（防 room.snapshot 全房广播在父进程堆积 OOM）
    this.textQueue.length = 0;
    this.textDrop = true;
    this._readyResolve();
    // 启动 MOVE 循环（每 100ms）+ RTT 探针 + 目标切换（每 5s 换目标，保证持续移动）
    this.moveTimer = setInterval(() => this.sendMove(), 100);
    this.moveTimer.unref?.();
    this.rttTimer = setInterval(() => this.probeRtt(), this.opts.rttInterval);
    this.rttTimer.unref?.();
    this.targetSwitchTimer = setInterval(() => { this.target = this.pickTarget(); }, 5000);
    this.targetSwitchTimer.unref?.();
    return this;
  }

  nextText() {
    const buffered = this.textQueue.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((res) => {
      const waiter = (msg) => { clearTimeout(t); res(msg); };
      const t = setTimeout(() => {
        const idx = this.textWaiters.indexOf(waiter);
        if (idx >= 0) this.textWaiters.splice(idx, 1);
        res(null);
      }, 5000);
      this.textWaiters.push(waiter);
    });
  }

  sendMove() {
    if (this.closed || !this.ws || this.ws.readyState !== 1) return;
    // 每 100ms 发一条 MOVE（活动玩家）。目标每 5s 换一次（targetSwitchTimer），
    // 不在到达时判停（避免依赖解码 selfPos）——目标格 5s 内必未到达，保证持续移动。
    this.ws.send(JSON.stringify({
      type: "input.cmd",
      payload: { cmd: { seq: this.seq++, tick: 0, action: 0, dir: 0, targetTile: this.target } },
    }));
  }

  /**
   * RTT 探针（隔离「自己位置变化」归属，避免父进程 O(实体×连接) 解码成为测量瓶颈）：
   *   ① 暂停 100ms MOVE 循环 → 发 STOP（服务端 1 tick 内停走）
   *   ② 探针窗口内解码帧，等到自己位置连续两帧一致（已停）→ 记录稳定位置
   *   ③ 发 MOVE（换新目标）→ 记 sendAt → 等到位置变化 → RTT = 到达 - sendAt
   *   4s 兜底放弃并恢复 MOVE 循环。只在探针窗口内解码 → 父进程解码成本 O(窗口帧×实体)。
   */
  probeRtt() {
    if (this.closed || this.probe.active || !this.ws || this.ws.readyState !== 1) return;
    this.probe.active = true;
    this.probe.phase = "stop"; // stop → move
    this.probe.prevPos = null;
    this.probe.sendAt = 0;
    if (this.moveTimer) { clearInterval(this.moveTimer); this.moveTimer = null; }
    // 发 STOP（服务端清 lastMove → 玩家立即停）
    this.ws.send(JSON.stringify({
      type: "input.cmd",
      payload: { cmd: { seq: this.seq++, tick: 0, action: InputActionSTOP, dir: 0 } },
    }));
    this.probe.timer = setTimeout(() => this.abortProbe(), 4000).unref?.();
  }

  abortProbe() {
    this.probe.active = false;
    if (this.probe.timer) { clearTimeout(this.probe.timer); this.probe.timer = null; }
    // 恢复 100ms MOVE 循环
    if (!this.moveTimer && !this.closed) {
      this.moveTimer = setInterval(() => this.sendMove(), 100);
      this.moveTimer.unref?.();
    }
  }

  onMessage(data, isBinary) {
    if (!isBinary) return;
    const now = Date.now();
    if (this.measuring) {
      this.frames += 1;
      if (this.lastFrameAt > 0) {
        const gap = now - this.lastFrameAt;
        if (gap > this.maxFrameGapMs) this.maxFrameGapMs = gap;
      }
      this.lastFrameAt = now;
    }
    // tick 计数（只读帧头 9 字节，O(1)，始终做）
    if (data.length >= 9 && data[0] === 0x01) {
      const tick = data.readUInt32LE(1);
      if (tick > 0) {
        if (this.firstTick === null) this.firstTick = tick;
        if (this.lastTick !== null && tick > this.lastTick + 1 && this.measuring) {
          this.droppedTicks += tick - this.lastTick - 1; // 服务端跳 tick（死亡螺旋丢帧）
        }
        this.lastTick = tick;
      }
    }
    // 仅在 RTT 探针窗口内做完整解码（找自己位置）
    if (!this.probe.active) return;
    const dec = decodeFrame(data, this.seatId ?? -1);
    if (dec.invalid || !dec.self) return;
    if (this.probe.phase === "stop") {
      if (this.probe.prevPos && dec.self.x === this.probe.prevPos.x && dec.self.y === this.probe.prevPos.y) {
        // 两帧位置一致 → 已停 → 发探针 MOVE（换新目标 → 保证位置变化）
        this.probe.phase = "move";
        this.probe.sendAt = Date.now();
        this.target = this.pickTarget();
        this.ws.send(JSON.stringify({
          type: "input.cmd",
          payload: { cmd: { seq: this.seq++, tick: 0, action: 0, dir: 0, targetTile: this.target } },
        }));
      } else {
        this.probe.prevPos = { x: dec.self.x, y: dec.self.y };
      }
    } else if (this.probe.phase === "move") {
      if (dec.self.x !== this.probe.prevPos.x || dec.self.y !== this.probe.prevPos.y) {
        this.rttSamples.push(now - this.probe.sendAt);
        this.abortProbe();
      }
    }
  }

  startMeasure() {
    this.measuring = true;
    this.measureStart = Date.now();
    this.frames = 0;
    this.droppedTicks = 0;
    this.firstTick = null;
    this.lastTick = null;
    this.lastFrameAt = 0;
    this.maxFrameGapMs = 0;
  }

  endMeasure() {
    this.measuring = false;
    this.measureEnd = Date.now();
    this.expectedFrames = (this.measureEnd - this.measureStart) / (1000 / 12);
  }

  stopTimers() {
    if (this.moveTimer) clearInterval(this.moveTimer);
    if (this.rttTimer) clearInterval(this.rttTimer);
    if (this.targetSwitchTimer) clearInterval(this.targetSwitchTimer);
    if (this.probe?.timer) clearTimeout(this.probe.timer);
  }

  close() {
    this.stopTimers();
    this.closed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  summary() {
    const arrival = this.expectedFrames > 0 ? (this.frames / this.expectedFrames) * 100 : 0;
    return {
      idx: this.idx,
      seatId: this.seatId,
      frames: this.frames,
      expected: Math.round(this.expectedFrames),
      arrivalPct: arrival,
      droppedTicks: this.droppedTicks,
      maxFrameGapMs: this.maxFrameGapMs,
      rttCount: this.rttSamples.length,
      rtt: this.rttSamples,
    };
  }
}

// ───────────────────────────────────────────── 统计工具 ─────────────────────────────────────────────
function pct(arr, p) {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function avg(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}
function max(arr) {
  if (arr.length === 0) return NaN;
  return Math.max(...arr);
}
function fmt(v, digits = 1) {
  if (!Number.isFinite(v)) return "—";
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

// ───────────────────────────────────────────── 单轮 N 压测 ─────────────────────────────────────────────
async function runCase(args, N, serverInfo) {
  const port = args.port;
  const url = `ws://127.0.0.1:${port}/ws/jianghu`;
  const clients = [];
  let statSamples = [];
  let failedJoins = 0;
  const joinErrors = [];

  // 连入 N 个客户端（错峰，防惊群）
  for (let i = 0; i < N; i++) {
    const c = new BenchClient(i, `${url}?devUserId=bench${N}_${i}`, args);
    try {
      await c.connect();
      clients.push(c);
    } catch (e) {
      failedJoins += 1;
      joinErrors.push({ idx: i, err: String(e?.message ?? e) });
      c.close();
      if (failedJoins > Math.max(4, N * 0.2)) throw new Error(`too many join failures at N=${N}: ${joinErrors[0]?.err}`);
    }
    await new Promise((r) => setTimeout(r, args.stagger));
  }

  // 预热（世界 settle + 玩家实体全部 spawn）
  await new Promise((r) => setTimeout(r, args.warmup));

  // 开始测量
  const measureStartAt = Date.now();
  for (const c of clients) c.startMeasure();
  await new Promise((r) => setTimeout(r, args.duration));
  for (const c of clients) c.endMeasure();
  const measureEndAt = Date.now();

  // 测量窗口内的服务端资源采样（自起模式）
  if (serverInfo) {
    const st = serverInfo.stats.filter((s) => s.t >= measureStartAt - 1000 && s.t <= measureEndAt + 1000);
    statSamples = st;
  }

  const summaries = clients.map((c) => c.summary());
  const rttAll = summaries.flatMap((s) => s.rtt);
  const arrivalAll = summaries.map((s) => s.arrivalPct);
  const dropsAll = summaries.map((s) => s.droppedTicks);
  const gapsAll = summaries.map((s) => s.maxFrameGapMs);

  const result = {
    N,
    joined: clients.length,
    failedJoins,
    joinErrors: joinErrors.slice(0, 5),
    durationMs: args.duration,
    arrival: {
      meanPct: avg(arrivalAll),
      minPct: Math.min(...arrivalAll),
      worstClient: summaries.reduce((a, b) => (a.arrivalPct < b.arrivalPct ? a : b)).idx,
    },
    rtt: {
      count: rttAll.length,
      p50: pct(rttAll, 50),
      p95: pct(rttAll, 95),
      p99: pct(rttAll, 99),
      maxMs: max(rttAll),
      meanMs: avg(rttAll),
    },
    droppedTicksTotal: dropsAll.reduce((s, x) => s + x, 0),
    droppedTicksMaxClient: max(dropsAll),
    maxFrameGapMsMax: max(gapsAll),
    server: statSamples.length
      ? {
          cpuPctAvg: avg(statSamples.map((s) => s.cpuPct)),
          cpuPctMax: max(statSamples.map((s) => s.cpuPct)),
          rssAvgMB: avg(statSamples.map((s) => s.rss)) / 1048576,
          rssMaxMB: max(statSamples.map((s) => s.rss)) / 1048576,
          samples: statSamples.length,
        }
      : null,
    perClient: summaries,
  };

  // 判定卡顿阈值
  result.stalled = result.arrival.meanPct < 90 || result.rtt.p95 > 500;
  result.stallReason = [];
  if (result.arrival.meanPct < 90) result.stallReason.push(`到达率 ${fmt(result.arrival.meanPct)}% < 90%`);
  if (result.rtt.p95 > 500) result.stallReason.push(`RTT p95 ${fmt(result.rtt.p95, 0)}ms > 500ms`);

  // 清理
  for (const c of clients) c.close();
  // 等连接全部释放（避免残留影响下一轮）
  await new Promise((r) => setTimeout(r, 500));

  return result;
}

// ───────────────────────────────────────────── 主流程 ─────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  jianghu E25 性能压测 · 并发快照广播 / MOVE 活动玩家");
  console.log(`  N = [${args.n.join(", ")}]  duration=${args.duration}ms  warmup=${args.warmup}ms`);
  console.log(`  模式: ${args.server ? `自起服务端 :${args.port}（子进程采样 CPU/RSS）` : `连接外部 :${args.port}（无资源采样）`}`);
  console.log("══════════════════════════════════════════════════════════════════");

  const results = [];
  let serverInfo = null;
  let stallN = null;

  try {
    for (const N of args.n) {
      if (args.server) {
        if (serverInfo) { serverInfo.child.kill("SIGTERM"); await new Promise((r) => setTimeout(r, 400)); }
        console.log(`\n[启动] 服务端 :${args.port} ...`);
        serverInfo = await spawnServer(args.port);
        console.log(`[启动] 服务端就绪（pid=${serverInfo.child.pid}）`);
      }

      console.log(`\n[压测] N=${N}（${args.duration}ms 测量窗口）...`);
      const t0 = Date.now();
      const res = await runCase(args, N, serverInfo);
      res.wallMs = Date.now() - t0;
      results.push(res);

      console.log(`  joined=${res.joined}/${N}  failed=${res.failedJoins}  到达率 avg=${fmt(res.arrival.meanPct)}%  min=${fmt(res.arrival.minPct)}%` +
        `  RTT p50=${fmt(res.rtt.p50, 0)}ms p95=${fmt(res.rtt.p95, 0)}ms max=${fmt(res.rtt.maxMs, 0)}ms` +
        `  droppedTicks=${res.droppedTicksTotal}  maxGap=${fmt(res.maxFrameGapMsMax, 0)}ms` +
        (res.server ? `  CPU avg=${fmt(res.server.cpuPctAvg)}% max=${fmt(res.server.cpuPctMax)}%  RSS avg=${fmt(res.server.rssAvgMB)}MB` : ""));
      if (res.failedJoins > 0) {
        console.log(`  ⚠ 加入失败 ${res.failedJoins} 个：${res.joinErrors.map((e) => `#${e.idx} ${e.err}`).join(" | ")}`);
      }
      if (res.stalled) {
        console.log(`  ⚠ 卡顿判定：${res.stallReason.join("；")}`);
        if (stallN === null) stallN = N;
      } else {
        console.log(`  ✓ 未卡顿（到达率≥90% 且 RTT p95≤500ms）`);
      }
    }
  } finally {
    if (serverInfo) { serverInfo.child.kill("SIGTERM"); }
  }

  // ── 汇总表 ──
  console.log("");
  console.log("════════════════════ 压测结果汇总 ════════════════════");
  console.log(" N   到达率avg  RTT p50  RTT p95  RTT max  CPUavg  CPUmax  RSSavg  droppedTicks  判定");
  for (const r of results) {
    console.log(
      ` ${String(r.N).padEnd(4)} ${fmt(r.arrival.meanPct).padStart(8)}%  ${fmt(r.rtt.p50, 0).padStart(6)}ms  ${fmt(r.rtt.p95, 0).padStart(6)}ms  ${fmt(r.rtt.maxMs, 0).padStart(7)}ms  ${fmt(r.server?.cpuPctAvg ?? NaN).padStart(6)}%  ${fmt(r.server?.cpuPctMax ?? NaN).padStart(6)}%  ${fmt(r.server?.rssAvgMB ?? NaN).padStart(7)}MB  ${String(r.droppedTicksTotal).padStart(13)}  ${r.stalled ? "⚠ 卡顿" : "✓"}`
    );
  }
  if (stallN !== null) {
    console.log(`\n卡顿阈值：N=${stallN}（到达率 <90% 或 RTT p95 >500ms 首次触发）`);
  } else {
    const maxN = args.n[args.n.length - 1];
    console.log(`\n卡顿阈值：未达（N≤${maxN} 全部通过；如需定位更高阈值请增大 --n）`);
  }
  console.log("════════════════════════════════════════════════════════");

  if (args.out) {
    writeFileSync(args.out, JSON.stringify({ args, results, stallN }, null, 2));
    console.log(`\n[out] 原始数据已写入 ${args.out}`);
  }
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});
