import puppeteer from "puppeteer";

const BASE = "http://localhost:4321/wander";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text());
});

await page.goto(BASE, { waitUntil: "networkidle2" });
await page.evaluate(() => {
  const i = document.querySelector('input[placeholder*="房间"]') || document.querySelector("input");
  if (i) i.focus();
});
// Join public room quickly by clicking the public-room button if present.
await sleep(500);
const joined = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => /加入|公共|开始/.test(b.textContent || ""));
  if (btn) { btn.click(); return true; }
  return false;
});
await sleep(1500);

// --- simulate 400ms network latency ---
const client = await page.target().createCDPSession();
await client.send("Network.enable");
await client.send("Network.emulateNetworkConditions", {
  offline: false, latency: 400, downloadThroughput: -1, uploadThroughput: -1,
});

const sample = () => page.evaluate(() => {
  const d = window.__wanderDebug;
  if (!d || d.renderX == null) return null;
  return { rx: d.renderX, ry: d.renderY, tx: d.targetX, ty: d.targetY, sx: d.serverX, sy: d.serverY, fac: d.facing };
});

// Walk RIGHT for 3.5s under latency
await page.keyboard.down("ArrowRight");
let maxLead = 0;
let maxRx = -1e9;
const hold = [];
for (let i = 0; i < 70; i++) {
  const s = await sample();
  if (s) {
    hold.push(s);
    maxRx = Math.max(maxRx, s.rx);
    if (s.tx != null && s.sx != null) maxLead = Math.max(maxLead, Math.abs(s.tx - s.sx) + Math.abs(s.ty - s.sy));
  }
  await sleep(50);
}
await page.keyboard.up("ArrowRight");

// After release, watch for 2s — any drop in rx = backward run
const rel = [];
for (let i = 0; i < 40; i++) {
  const s = await sample();
  if (s) rel.push(s);
  await sleep(50);
}
await client.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

const minRxAfterRelease = Math.min(...rel.map((s) => s.rx));
const finalRx = rel[rel.length - 1].rx;
const backwardRun = minRxAfterRelease < maxRx - 0.05; // dropped > 0.05 cell after release
console.log("LATENCY TEST (400ms):");
console.log("  maxRx during hold =", maxRx.toFixed(2));
console.log("  max|target-server| lead =", maxLead.toFixed(2), "(PREDICT_BUFFER=2 → must stay <=2)");
console.log("  minRx after release =", minRxAfterRelease.toFixed(2));
console.log("  finalRx after settle =", finalRx.toFixed(2));
console.log("  BACKWARD RUN? ", backwardRun);
console.log("  lead within buffer (<=2)?", maxLead <= 2.001);
console.log("  errs:", errs.length ? errs.slice(0, 3) : "none");

await browser.close();
