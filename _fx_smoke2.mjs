import puppeteer from "puppeteer";

const URL = "http://localhost:4321/wander?devUserId=fxuser";
const errors = [];
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
      errors.push("console: " + m.text());
    }
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });

  await page.waitForFunction(
    () => {
      const d = window.__wanderDebug;
      return d && d.youId && d.online >= 1;
    },
    { timeout: 15000 },
  );

  await page.keyboard.down("ArrowRight");
  await new Promise((r) => setTimeout(r, 1300));
  await page.keyboard.up("ArrowRight");
  await new Promise((r) => setTimeout(r, 200));

  const dbg = await page.evaluate(() => window.__wanderDebug);
  console.log("DEBUG:", JSON.stringify(dbg));
  console.log("JS_ERRORS:", errors.length ? JSON.stringify(errors) : "none");

  const ok = errors.length === 0 && dbg && dbg.fxParticles > 0 && dbg.fxTrailPts > 0;
  console.log(ok ? "FX_SMOKE_PASS" : "FX_SMOKE_FAIL");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.log("SMOKE_THREW:", e.message);
  console.log("JS_ERRORS:", JSON.stringify(errors));
  process.exitCode = 1;
} finally {
  await browser.close();
}
