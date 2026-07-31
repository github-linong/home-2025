import puppeteer from "puppeteer";
const BASE = "http://127.0.0.1:4399";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  headless: "new",
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => console.log(`[console.${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (u.includes("127.0.0.1")) console.log(`[reqfail] ${u} ${r.failure()?.errorText}`);
  });
  await page.goto(BASE + "/wander", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 6000));
  const state = await page.evaluate(() => ({
    hasDebug: typeof window.__wanderDebug,
    debug: window.__wanderDebug || null,
    canvas: !!document.getElementById("board"),
    connText: document.getElementById("conn-text")?.textContent,
    roomHidden: document.getElementById("room")?.classList.contains("hidden"),
    astroError: document.querySelector("vite-error-overlay") ? "VITE_OVERLAY_PRESENT" : "none",
  }));
  console.log("STATE:", JSON.stringify(state, null, 2));
} finally {
  await browser.close();
}
