#!/usr/bin/env node
/**
 * build-local-sim.mjs — 把 sim-core（纯 TS 确定性权威模拟）打包成浏览器单文件 bundle。
 *
 * 为什么需要：玩家要求「完全不依赖服务端、本地就能玩」的版本。
 * 原理：sim-core 是引擎无关的确定性模拟（world/combat/enemy-ai/skills/dungeon-gen/rng/...），
 *       零 Node 运行时依赖。用 esbuild 打成 IIFE → window.__LocalSim = { createWorld, ... }。
 *
 * 输出：apps/web/public/games/dungeon/local-sim.js
 * 入口：world.ts 的 createWorld / createWorldInputQueue
 *
 * 用法：
 *   node scripts/build-local-sim.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENTRY = path.join(ROOT, "games", "dungeon-online", "packages", "sim-core", "src", "world.ts");
const OUT = path.join(ROOT, "apps", "web", "public", "games", "dungeon", "local-sim.js");

// 定位 esbuild（项目根 node_modules，本脚本所在仓库可能没有——向上找 workspace 根）。
function findEsbuildBin() {
  const candidates = [
    path.join(ROOT, "node_modules", ".bin", "esbuild"),
    path.join(ROOT, "games", "dungeon-online", "node_modules", ".bin", "esbuild"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // 全局兜底
  try { const g = execSync("npm root -g", { encoding: "utf8" }).trim(); const c = path.join(g, ".bin", "esbuild"); if (fs.existsSync(c)) return c; } catch {}
  throw new Error("esbuild not found — run `npm i esbuild` at workspace root first");
}

const esbuild = findEsbuildBin();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
execSync(`${esbuild} ${ENTRY} --bundle --format=iife --global-name=__LocalSim --outfile=${OUT} --log-level=warning`, {
  stdio: "inherit",
  cwd: ROOT,
});
console.log(`✓ local-sim bundle: ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} bytes)`);
console.log(`  浏览器注入 window.__LocalSim = { createWorld, createWorldInputQueue, NS }`);
