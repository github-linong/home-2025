#!/usr/bin/env node
/**
 * sync-games.mjs — 把 games/ 下的客户端构建产物同步到 apps/web/public/games/
 * ============================================================================
 * 用法：
 *   node scripts/sync-games.mjs                  # 全部游戏
 *   node scripts/sync-games.mjs --only dungeon   # 只同步 dungeon
 *   node scripts/sync-games.mjs --dry-run        # 只打印，不改文件
 *
 * 同步内容：
 *   games/dungeon-online/apps/web-client/index.html → apps/web/public/games/dungeon/index.html
 *   games/dungeon-online/apps/web-client/assets/*    → apps/web/public/games/dungeon/assets/
 *   games/jianghu/apps/web-client/index.html         → apps/web/public/games/jianghu/index.html
 *
 * 设计：public 是部署版，source 是开发版。开发时改 source，CI 跑这个脚本把 source
 *       同步到 public；本地改 public 后也能反过来同步。任意方向都可。
 *
 * 长期避免：source 和 public 长期分叉导致线上 / 仓库不一致。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const dryRun = args.includes("--dry-run");
const reverse = args.includes("--reverse"); // public → source

const PAIRS = [
  {
    name: "dungeon",
    a: path.join(ROOT, "games", "dungeon-online", "apps", "web-client"),
    b: path.join(ROOT, "apps", "web", "public", "games", "dungeon"),
  },
  {
    name: "jianghu",
    a: path.join(ROOT, "games", "jianghu", "apps", "web-client"),
    b: path.join(ROOT, "apps", "web", "public", "games", "jianghu"),
  },
];

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`  + ${path.relative(ROOT, dst)}`);
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

function syncPair(p) {
  const [src, dst] = reverse ? [p.b, p.a] : [p.a, p.b];
  if (!fs.existsSync(src)) {
    console.warn(`!! source 不存在：${src}`);
    return;
  }
  console.log(`\n[${p.name}] ${path.relative(ROOT, src)} → ${path.relative(ROOT, dst)}`);
  // index.html
  const indexSrc = path.join(src, "index.html");
  const indexDst = path.join(dst, "index.html");
  if (fs.existsSync(indexSrc)) {
    if (dryRun) console.log(`  would copy index.html`);
    else copyFile(indexSrc, indexDst);
  }
  // assets/
  if (dryRun) {
    if (fs.existsSync(path.join(src, "assets"))) console.log(`  would sync assets/`);
  } else {
    copyDir(path.join(src, "assets"), path.join(dst, "assets"));
  }
  // local-sim.js（本地单机模拟器，双端都要有）
  const lsimSrc = path.join(src, "local-sim.js");
  const lsimDst = path.join(dst, "local-sim.js");
  if (fs.existsSync(lsimSrc)) {
    if (dryRun) console.log(`  would copy local-sim.js`);
    else copyFile(lsimSrc, lsimDst);
  }
}

console.log(`sync-games ${dryRun ? "(dry-run)" : ""} ${reverse ? "(reverse)" : ""}`);
for (const p of PAIRS) {
  if (only && p.name !== only) continue;
  syncPair(p);
}
console.log(`\n✓ 同步完成`);
