import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SIM_SRC = join(__dirname, "sim-core", "src");
const re = /(import|export)\s+(type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g;
const src = readFileSync(join(SIM_SRC, "combat.ts"), "utf8");
let m;
while ((m = re.exec(src))) {
  console.log(JSON.stringify({ full: m[0], typeOnlyCapture: m[2], target: m[3] }));
}
