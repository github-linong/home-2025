/**
 * dependency-direction.test.ts — 依赖方向白名单（C6 纪律 A/B）
 * ===========================================================================
 * 静态扫描 sim-core/src 各模块的 import 边，断言：
 *   - 纪律 A：spawning 不 import loot 运行时（仅 `import type` 允许）。
 *   - 纪律 A：dungeonGen 不 import spawning 运行时。
 *   - 纪律 B：parry 不 import combat 运行时（仅被 combat 经类型引用）。
 *   - sim-core 自包含：任何模块不得运行时 import 服务器 src（../src/...）；
 *     服务器是唯一编排点（run-runtime / run-manager）。
 *
 * 通过 lint / 依赖方向测试拦截反向 import（控制清单 C6）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIM_SRC = join(__dirname, "..", "sim-core", "src");

interface Edge {
  from: string;
  to: string;
  typeOnly: boolean;
}

function baseName(p: string): string {
  return p.replace(/^\.\//, "").replace(/\.ts$/, "").split("/").pop()!;
}

function collectEdges(): Edge[] {
  const edges: Edge[] = [];
  const files = readdirSync(SIM_SRC).filter((f) => f.endsWith(".ts"));
  for (const f of files) {
    const from = baseName(f);
    const src = readFileSync(join(SIM_SRC, f), "utf8");
    // 匹配 import ... from '...' / import type ... from '...' / export ... from '...'
    const re = /(import|export)\s+(type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const isTypeOnly = m[2] != null;
      const target = m[3];
      if (!target.startsWith(".")) continue; // 跳过 node: / 外部包
      edges.push({ from, to: baseName(target), typeOnly: isTypeOnly });
    }
  }
  return edges;
}

const edges = collectEdges();

test("discipline A: spawning does NOT runtime-import loot", () => {
  const bad = edges.filter((e) => e.from === "spawning" && e.to === "loot" && !e.typeOnly);
  assert.equal(bad.length, 0, "spawning → loot runtime import forbidden (type-only allowed)");
});

test("discipline A: dungeonGen does NOT runtime-import spawning", () => {
  const bad = edges.filter((e) => e.from === "dungeonGen" && e.to === "spawning" && !e.typeOnly);
  assert.equal(bad.length, 0, "dungeonGen → spawning runtime import forbidden");
});

test("discipline B: parry does NOT runtime-import combat", () => {
  const bad = edges.filter((e) => e.from === "parry" && e.to === "combat" && !e.typeOnly);
  assert.equal(bad.length, 0, "parry → combat runtime import forbidden (parry is called by combat)");
});

test("sim-core is self-contained: no module runtime-imports server src", () => {
  const bad = edges.filter((e) => e.to.startsWith("..") || e.to === "src");
  assert.equal(bad.length, 0, "sim-core must not depend on server runtime (server is the orchestrator)");
});

test("sanity: expected legitimate edges exist", () => {
  // combat → parry (type) allowed; spawning → dungeonGen/spawning→loot(type) allowed
  const combatParryType = edges.some(
    (e) => e.from === "combat" && e.to === "parry" && e.typeOnly,
  );
  assert.ok(combatParryType, "combat should type-import parry");
  const spawningLootType = edges.some(
    (e) => e.from === "spawning" && e.to === "loot" && e.typeOnly,
  );
  assert.ok(spawningLootType, "spawning may type-import loot");
});
