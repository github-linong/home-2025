/**
 * determinism.test.ts — 确定性 golden 测试（C7 / D9 / E3.S3.4）
 *
 * S3.4 落地：同 seed + 同 biome → 同 LayoutSnapshot（JSON 序列化 sha256 对齐）。
 * 这是 TS 权威 ↔ GDScript 端口 golden 对齐的锚点之一（D9）。
 *
 * 对齐约束（test-framework §5）：在 design-strategist 完成 C9（D3 回填）前，
 *   telegraph 前摇须用锁定值 0.6s（18 tick），golden 向量据此锁定。
 *
 * GOLDEN_WORLD_HASH 仍待 E5 战斗管线接入后填充（同 seed + 同输入序列 → 同世界哈希）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateLayout } from "../../src/dungeon-gen.ts";
import { ENEMY_PROTOTYPES } from "../../src/types.ts";

// 锁定 golden 锚点（由 `node --experimental-strip-types` 跑 generateLayout 实测得到，
// 后续任何破坏确定性的改动都会让本断言失败 → 强制 golden 对齐）。
// caster_ember 重锁说明：dungeon-gen 新增 caster_ember 注入（elite_warden 槽 ~20% 确定性替换），
//   随机池排除该 id 但 elite 命中后额外 nextBool 抽流 → 后续 spawn 坐标/资源点随之漂移 →
//   布局哈希改变；确定性未破坏（同 seed+biome 三次运行字节相等），故重锁本值。
// wave-progression 重锁说明：dungeon-gen 新增「wave 1 必含 grunt_swarm」保证（确定性改写首个
//   wave-1 刷怪点 enemyTypeId），使 wave 1 首个刷怪点由非 grunt 变为 grunt_swarm → 布局哈希改变；
//   确定性未破坏（同 seed+biome 三次运行字节相等），故重锁本值。
// brute_charger 重锁说明：dungeon-gen 新增 brute_charger 注入（grunt_swarm 槽 ~20% 确定性替换），
//   随机池排除该 id 但 grunt 命中后额外 nextBool 抽流 → 后续 spawn 坐标/资源点随之漂移 →
//   布局哈希改变；确定性未破坏（同 seed+biome 三次运行字节相等），故重锁本值。
// bomber_imp 重锁说明：dungeon-gen 新增 bomber_imp 注入（grunt_swarm 槽 wave>1 时 15% 确定性替换，
//   复用 grunt 槽那单次 nextFloat 抽流：r<0.2→brute，0.2≤r<0.35→bomber，否则 grunt；rng 抽流与
//   「仅 brute」先例逐位一致，仅 wave≥2 grunt 结果分布改变 → 布局中部分 grunt_swarm 变为 bomber_imp
//   → 布局哈希改变；确定性未破坏（同 seed+biome 三次运行字节相等，见下方校验），故重锁本值。
//   注：world 哈希（GOLDEN_WORLD_HASH，E5）与 playtest 哈希（GOLDEN_PLAYTEST_HASH）未变——
//   二者仅涉及 wave-1（恒为 grunt_swarm，首刷怪点 rng 抽流未漂移）与 220-tick 窗口（未抵达含
//   bomber_imp 的 wave≥2），故实体集不变、哈希稳定。
// BAL-FIX 2026-08-11 重锁：SPAWN_COUNT_MAX 6→4（刷怪密度收敛）→ 布局哈希改变；确定性未破坏。
// DIST-FIX 2026-08-11 重锁：wave1 刷怪点锚定到玩家出生点 150-300px 环带（开局即可接敌）→
//   布局哈希改变；确定性未破坏（同 seed+biome 三次运行字节相等），故重锁本值。
// SLAUGHTER-FIX 2026-08-12 重锁：SPAWN 6-10/点 + 2-4 波/层 + 资源 4-8 → 布局哈希改变；确定性未破坏。
const GOLDEN_LAYOUT_HASH = "2dd90a2ef1cfd3dc3f7e8915a2531dbd5aba70dc8a7a94cc9f9af7cc2c4a9808";
// E5 战斗管线接入后填充（同 seed + 同输入序列 → 同世界哈希；见 world-determinism.test.ts）。
const GOLDEN_WORLD_HASH =
  "823863c6b4927719b78d28f4e4de1867e4da281141191b58b303d3888017ed27";

function hashLayout(layout: unknown): string {
  return createHash("sha256").update(JSON.stringify(layout)).digest("hex");
}

test("E3 determinism: same seed + biome → identical LayoutSnapshot", () => {
  const a = generateLayout("EMBER-S1", 0);
  const b = generateLayout("EMBER-S1", 0);
  assert.deepEqual(a, b);
  assert.equal(hashLayout(a), hashLayout(b));
});

test("E3 golden anchor: pinned hash stays constant across runs (C7)", () => {
  const layout = generateLayout("EMBER-S1", 0);
  assert.equal(hashLayout(layout), GOLDEN_LAYOUT_HASH);
});

test("E3 determinism: different biome → different layout", () => {
  const a = generateLayout("EMBER-S1", 0);
  const b = generateLayout("EMBER-S1", 1);
  assert.notDeepEqual(a, b);
  assert.notEqual(hashLayout(a), hashLayout(b));
});

test("E3 determinism: different seed → different layout", () => {
  const a = generateLayout("EMBER-S1", 0);
  const b = generateLayout("OTHER-SEED", 0);
  assert.notDeepEqual(a, b);
  assert.notEqual(hashLayout(a), hashLayout(b));
});

test("E3 S3.2 contract: SpawnPoint[] is read-only and references valid enemy prototypes (discipline A)", () => {
  const layout = generateLayout("EMBER-S1", 0);
  // spawnPoints 为只读实例：不得被运行时代码反向修改（此处仅校验结构契约）。
  assert.ok(Array.isArray(layout.spawnPoints));
  for (const sp of layout.spawnPoints) {
    assert.ok(typeof sp.pos.x === "number" && typeof sp.pos.y === "number");
    assert.ok(typeof sp.enemyTypeId === "string");
    assert.ok(typeof sp.wave === "number");
    assert.ok(typeof sp.count === "number");
    assert.ok(
      sp.enemyTypeId in ENEMY_PROTOTYPES,
      `enemyTypeId ${sp.enemyTypeId} must reference ③ prototype table`,
    );
  }
  assert.notEqual(GOLDEN_WORLD_HASH, "PENDING_E5");
});
