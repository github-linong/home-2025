// Headless acceptance test for the Wander game's movement smoothness.
// Loads /wander in real Chromium, holds ArrowRight, and samples the rendered
// local-player X every animation frame. We assert:
//   1. the player actually moves (total displacement > 0)
//   2. the render position NEVER snaps backward (the old jitter bug)
//   3. per-frame deltas are small & smooth (no teleport jumps)
//   4. a second client is visible to the first (public-room presence)
import puppeteer from "puppeteer";

const BASE = process.env.BASE || "http://127.0.0.1:4399";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function fail(msg) {
  console.log("FAIL: " + msg);
  process.exitCode = 1;
}

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(BASE + "/wander", { waitUntil: "domcontentloaded", timeout: 30000 });
  // wait until the client has joined the public room and youId is set
  await page.waitForFunction(
    () => window.__wanderDebug && window.__wanderDebug.youId && window.__wanderDebug.online >= 1,
    { timeout: 30000 },
  );

  // second client for presence check
  const page2 = await browser.newPage();
  await page2.goto(BASE + "/wander?devUserId=wander_bot2", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page2.waitForFunction(
    () => window.__wanderDebug && window.__wanderDebug.youId,
    { timeout: 30000 },
  );

  // blur any focused element so keydown hits window
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.bringToFront();

  // hold ArrowRight and sample the rendered X for ~1.6s
  await page.keyboard.down("ArrowRight");
  const samples = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const out = [];
        let n = 0;
        const start = performance.now();
        function tick() {
          const d = window.__wanderDebug;
          if (d) out.push({ t: performance.now() - start, x: d.renderX, tx: d.targetX });
          n += 1;
          if (n < 110) requestAnimationFrame(tick);
          else resolve(out);
        }
        requestAnimationFrame(tick);
      }),
  );
  await page.keyboard.up("ArrowRight");

  // ---- analyze ----
  const xs = samples.map((s) => s.x).filter((v) => typeof v === "number");
  const first = xs[0];
  const last = xs[xs.length - 1];
  const total = last - first;

  let backtracks = 0;
  let maxDelta = 0;
  for (let i = 1; i < xs.length; i += 1) {
    const d = xs[i] - xs[i - 1];
    if (d < -1e-6) backtracks += 1; // moved left = the jitter we fixed
    if (Math.abs(d) > maxDelta) maxDelta = Math.abs(d);
  }
  const fps = xs.length > 1 ? (xs.length / ((samples[samples.length - 1].t - samples[0].t) / 1000)) : 0;

  console.log(`samples=${xs.length} fps≈${fps.toFixed(0)}`);
  console.log(`x: start=${first?.toFixed(2)} end=${last?.toFixed(2)} total=${total.toFixed(2)} cells`);
  console.log(`backtracks(backward snaps)=${backtracks}  maxPerFrameDelta=${maxDelta.toFixed(3)} cells`);

  if (total <= 0.5) fail("player did not move while holding ArrowRight");
  else console.log("PASS: player moves right");

  if (backtracks > 0) fail(`${backtracks} backward snaps detected (jitter not fixed)`);
  else console.log("PASS: no backward snaps (smooth, no jitter)");

  if (maxDelta > 0.5) fail(`per-frame jump too large (${maxDelta.toFixed(3)} cells) — teleport, not glide`);
  else console.log(`PASS: per-frame motion is smooth (max ${maxDelta.toFixed(3)} cells/frame)`);

  // presence: first page should now see >=2 players (itself + bot2)
  const online = await page.evaluate(() => window.__wanderDebug.online);
  if (online >= 2) console.log(`PASS: public-room presence (online=${online})`);
  else fail(`public-room presence failed (online=${online}, expected >=2)`);

  if (errors.length) {
    console.log("console/page errors:");
    for (const e of errors.slice(0, 10)) console.log("  - " + e);
    fail(`${errors.length} console/page errors`);
  } else {
    console.log("PASS: no console/page errors");
  }
} finally {
  await browser.close();
}

console.log(process.exitCode ? "\n=== ACCEPTANCE: FAIL ===" : "\n=== ACCEPTANCE: PASS ===");
