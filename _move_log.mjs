import puppeteer from "puppeteer";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = "http://localhost:4321/wander?devUserId=LOGTEST";

const logs = [];
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 800 });

page.on("console", (msg) => {
  const t = msg.text();
  if (t.includes("[wander]")) logs.push(t);
});
page.on("pageerror", (e) => logs.push("[pageerror] " + e.message));

const sample = () =>
  page.evaluate(() => {
    const d = window.__wanderDebug;
    const evts = window.__wanderEvents || [];
    const hist = {};
    for (const e of evts) hist[e.tag] = (hist[e.tag] || 0) + 1;
    return {
      rx: d?.renderX, ry: d?.renderY, tx: d?.targetX, ty: d?.targetY,
      sx: d?.serverX, sy: d?.serverY, fac: d?.facing,
      held: d?.held, connected: d?.connected,
      evtCount: evts.length, hist,
    };
  });

console.log("=== navigate ===");
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => { window.__wanderLog = true; });

// wait for connection + first snapshot
let connected = false;
for (let i = 0; i < 40; i++) {
  const s = await sample();
  if (s.rx !== undefined && s.connected) { connected = true; break; }
  await sleep(250);
}
console.log("connected:", connected);
const base = await sample();
console.log("BASELINE:", JSON.stringify(base));

const timeline = [];
async function phase(label, key, ms) {
  await page.keyboard.down(key);
  await sleep(ms);
  const mid = await sample();
  await page.keyboard.up(key);
  await sleep(400);
  const after = await sample();
  timeline.push({ label, key, ms, mid, after });
  console.log(`\n--- ${label} (hold ${key} ${ms}ms) ---`);
  console.log("  mid  :", JSON.stringify(mid));
  console.log("  after:", JSON.stringify(after));
}

await phase("HOLD RIGHT 1", "ArrowRight", 1500);
await phase("HOLD RIGHT 2", "ArrowRight", 1000);
await phase("HOLD DOWN", "ArrowDown", 1200);

console.log("\n=== EVENT HISTOGRAM (window.__wanderEvents) ===");
const final = await sample();
console.log(JSON.stringify(final.hist, null, 2));

console.log("\n=== RAW [wander] LOGS (last 120) ===");
for (const l of logs.slice(-120)) console.log(l);

console.log("\n=== KEY SEQUENCE SUMMARY ===");
for (const p of timeline) {
  console.log(`${p.label}: mid rx=${p.mid.rx} ry=${p.mid.ry} tx=${p.mid.tx} ty=${p.mid.ty} | after rx=${p.after.rx} ry=${p.after.ry}`);
}

await browser.close();
