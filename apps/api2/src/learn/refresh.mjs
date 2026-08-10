/**
 * refresh.mjs — Standalone launcher for the learn-english hourly material
 * generator. In normal operation the API endpoint (POST/GET /api/learn/generate)
 * is preferred (the hourly automation hits that endpoint); this script is for
 * manual runs or environments without the server.
 *
 * It is fully FILE-BACKED: it writes data/learn/auto.json and needs NO Postgres.
 * All logic lives in generate.js (single source of truth).
 *
 * Usage: node --env-file=.env src/learn/refresh.mjs
 *        LEARN_DRYRUN=1 node src/learn/refresh.mjs   # build but don't write
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  pickTheme,
  buildContent,
  applyToAuto,
  loadAuto,
  saveAuto,
} from "./generate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile?.(join(__dirname, "..", "..", ".env"));
} catch {
  /* env already provided */
}

const dryRun = process.env.LEARN_DRYRUN === "1";

const now = new Date();
const theme = pickTheme(now);
const content = await buildContent(theme, now);
const auto = loadAuto();
const summary = applyToAuto(auto, content.hourKey, content);

if (summary.skipped) {
  console.log("[learn:refresh] hour already generated, nothing to do:", summary.deckSlug);
  process.exit(0);
}

if (dryRun) {
  console.log("[learn:refresh] DRYRUN — would write:", JSON.stringify({ ...summary, theme: theme.key }, null, 2));
  process.exit(0);
}

saveAuto(auto);
console.log("[learn:refresh] OK:", JSON.stringify({ ...summary, theme: theme.key, hour: content.hour, source: content.source }, null, 2));
