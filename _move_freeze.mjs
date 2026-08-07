import puppeteer from "puppeteer";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "http://localhost:4321/wander?devUserId=FREEZE";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 800 });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => { window.__wanderLog = true; });

// wait connect
let ok = false;
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => ({ rx: window.__wanderDebug?.renderX, c: window.__wanderDebug?.connected }));
  if (s.rx !== undefined && s.c) { ok = true; break; }
  await sleep(250);
}
console.log("connected:", ok);

const now = () => page.evaluate(() => performance.now());
const clearBuf = () => page.evaluate(() => { window.__wanderEvents.length = 0; });
const buf = () => page.evaluate(() => window.__wanderEvents.map((e) => ({ t: e.t, tag: e.tag, dir: e.dir })));

// Phase A: hold DOWN straight ~1200ms
await page.keyboard.down("ArrowDown");
await sleep(1200);
// Phase B: add LEFT (diagonal down-left) ~500ms, then release LEFT -> back to DOWN only
await page.keyboard.down("ArrowLeft");
await sleep(500);
await page.keyboard.up("ArrowLeft");
// Phase C: keep holding DOWN (freeze-prone window)
const tCstart = await now();
clearBuf();
await sleep(1600);
await page.keyboard.up("ArrowDown");
const tCend = await now();

const evts = await buf();
const inWin = evts.filter((e) => e.t >= tCstart && e.t <= tCend);
const queue = inWin.filter((e) => e.tag === "step-queue").length;
const block = inWin.filter((e) => e.tag === "step-block-ahead").length;

// max consecutive step-block-ahead with no step-queue in between
let maxRun = 0, run = 0;
for (const e of inWin) {
  if (e.tag === "step-block-ahead") run++;
  else if (e.tag === "step-queue") { maxRun = Math.max(maxRun, run); run = 0; }
}
maxRun = Math.max(maxRun, run);

const finalPos = await page.evaluate(() => ({ rx: window.__wanderDebug?.renderX, ry: window.__wanderDebug?.renderY }));
console.log(`\n=== PHASE C (hold DOWN after diagonal, ${Math.round(tCend - tCstart)}ms) ===`);
console.log("step-queue:", queue, " step-block-ahead:", block, " maxConsecutiveBlocks:", maxRun);
console.log("final render:", JSON.stringify(finalPos));
console.log(queue > 5 && maxRun < 6 ? "RESULT: NOT FROZEN (fixed)" : "RESULT: FROZEN (bug remains)");

await browser.close();
