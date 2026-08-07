/**
 * dungeonGen.test.ts — 随机副本生成（E5 · ADR-JH-ENG-03）
 * ===========================================================================
 * 覆盖：D9 确定性（同 seed ⇒ 同布局）、rooms ∈ [5,12]、maxDepth=3、
 * C-Dgn-3 BOSS 必置最深层（100 次生成 0 例异常）、不同 seed/biome 布局可区分、
 * DungeonSpec.spawnZones 形状合法（供实例 world 使用）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { generateLayout, buildDungeonSpec, layoutRng } from "../../src/dungeonGen.ts";

test("layoutRng is deterministic (same seed → same stream, D9)", () => {
  assert.equal(layoutRng("s1").nextInt(0, 1000), layoutRng("s1").nextInt(0, 1000));
  assert.equal(layoutRng("s1").nextInt(0, 1000), layoutRng("s1").nextInt(0, 1000));
});

test("same seed → identical layout (D9 golden)", () => {
  const a = generateLayout("seedA", 0);
  const b = generateLayout("seedA", 0);
  assert.deepEqual(a, b, "byte-identical layout for same seed");
  const c = buildDungeonSpec("seedA", 0);
  const d = buildDungeonSpec("seedA", 0);
  assert.deepEqual(c, d, "byte-identical spec for same seed");
});

test("different seed → distinguishable layout", () => {
  const a = generateLayout("seedA", 0);
  const b = generateLayout("seedB", 0);
  assert.notDeepEqual(a.spawnPoints, b.spawnPoints, "different seeds differ in spawn points");
});

test("rooms in [5,12], maxDepth=3 (dungeon §⑥)", () => {
  for (let i = 0; i < 100; i++) {
    const l = generateLayout(`range-${i}`, 0);
    assert.ok(l.rooms >= 5 && l.rooms <= 12, `seed range-${i}: rooms=${l.rooms}`);
    assert.equal(l.maxDepth, 3, `seed range-${i}: maxDepth=3`);
  }
});

test("BOSS always at deepest depth: 100 generations, 0 violations (C-Dgn-3)", () => {
  for (let i = 0; i < 100; i++) {
    const l = generateLayout(`boss-${i}`, 0);
    assert.equal(l.bossPlaced, true, `seed boss-${i}: bossPlaced=true`);
    const spec = buildDungeonSpec(`boss-${i}`, 0);
    assert.equal(spec.bossDepth, spec.maxDepth, `seed boss-${i}: boss at deepest`);
    assert.equal(spec.bossDepth, 3, `seed boss-${i}: bossDepth=3`);
    const bossZones = spec.spawnZones.filter((z) => z.tier === 2);
    assert.equal(bossZones.length, 1, `seed boss-${i}: exactly one boss zone`);
    assert.equal(bossZones[0].pos.x, spec.bossTile.x, `seed boss-${i}: boss zone at bossTile.x`);
    assert.equal(bossZones[0].pos.y, spec.bossTile.y, `seed boss-${i}: boss zone at bossTile.y`);
  }
});

test("DungeonSpec zones are valid SpawnZone shapes (tier 0|1|2, count>0)", () => {
  const spec = buildDungeonSpec("shape", 0);
  assert.ok(spec.spawnZones.length > 0, "instance spawns enemies");
  for (const z of spec.spawnZones) {
    assert.ok(z.tier === 0 || z.tier === 1 || z.tier === 2, `tier=${z.tier}`);
    assert.ok(Number.isInteger(z.count) && z.count >= 1, `count=${z.count}`);
    assert.ok(typeof z.enemyTypeId === "string" && z.enemyTypeId.length > 0);
    assert.ok(Number.isFinite(z.pos.x) && Number.isFinite(z.pos.y));
  }
  // 副本刷怪密度 ×1.5 标注（spawning.md §⑥）。
  assert.equal(spec.spawnDensityMultiplier, 1.5);
});

test("different biome → different layout (biome participates in seed stream)", () => {
  const a = generateLayout("seedX", 0);
  const b = generateLayout("seedX", 1);
  assert.notDeepEqual(a.spawnPoints, b.spawnPoints, "biome must differentiate layout");
});

test("spawn points are within world bounds (40×30 tile, px)", () => {
  const spec = buildDungeonSpec("bounds", 0);
  for (const z of spec.spawnZones) {
    assert.ok(z.pos.x >= 0 && z.pos.x <= 40 * 48, `x=${z.pos.x}`);
    assert.ok(z.pos.y >= 0 && z.pos.y <= 30 * 48, `y=${z.pos.y}`);
  }
  assert.ok(spec.entryTile.x >= 0 && spec.entryTile.y >= 0, "entry tile valid");
});
