/**
 * spawning.test.ts — E4 确定性刷怪单测
 * ===========================================================================
 * 覆盖：spawnWave 确定性（同 seed 同结果，D9）、HP_MULT 三档（普通/精英/BOSS）、
 * count 数量、atk 随 tier 缩放、pos 在刷怪点附近散布、lootPreview 空（spawning 不掉装）、
 * nextRespawnTick 复活计时。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnWave, nextRespawnTick, type SpawnZone } from "../../src/spawning.ts";
import { Rng } from "../../src/rng.ts";
import { EntityKind } from "../../src/types.ts";
import {
  ENEMY_BASE_HP,
  ENEMY_BASE_ATK,
  SPAWN_SCATTER_PX,
  DEFAULT_RESPAWN_TICKS,
} from "../../src/constants.ts";

const zone = (tier: 0 | 1 | 2, count: number, pos = { x: 100, y: 100 }): SpawnZone => ({
  pos,
  tier,
  enemyTypeId: "e",
  count,
});

test("spawnWave: 同 seed ⇒ 同敌人集 / 同 HP / 同散布（D9 确定性）", () => {
  const a = spawnWave([zone(0, 3)], new Rng("s1"));
  const b = spawnWave([zone(0, 3)], new Rng("s1"));
  assert.equal(a.spawned, b.spawned);
  assert.deepEqual(
    a.enemies.map((e) => e.pos),
    b.enemies.map((e) => e.pos),
  );
  assert.deepEqual(
    a.enemies.map((e) => e.hp),
    b.enemies.map((e) => e.hp),
  );
});

test("spawnWave: HP_MULT 三档（普通×1 / 精英×3 / BOSS×10）+ kind", () => {
  const normal = spawnWave([zone(0, 1)], new Rng("n"))!.enemies[0];
  const elite = spawnWave([zone(1, 1)], new Rng("e"))!.enemies[0];
  const boss = spawnWave([zone(2, 1)], new Rng("b"))!.enemies[0];

  assert.equal(normal.hp, ENEMY_BASE_HP);
  assert.equal(normal.kind, EntityKind.ENEMY);

  assert.equal(elite.hp, ENEMY_BASE_HP * 3);
  assert.equal(elite.kind, EntityKind.ENEMY);

  assert.equal(boss.hp, ENEMY_BASE_HP * 10);
  assert.equal(boss.kind, EntityKind.BOSS);
});

test("spawnWave: count 实例化 N 个敌人 + atk 随 tier 缩放", () => {
  const r = spawnWave([zone(1, 4)], new Rng("s"));
  assert.equal(r.spawned, 4);
  assert.equal(r.enemies.length, 4);
  assert.equal(r.enemies[0].atk, ENEMY_BASE_ATK * 3);
  for (const e of r.enemies) assert.equal(e.tier, 1);
});

test("spawnWave: pos 在刷怪点附近确定性散布（±SPAWN_SCATTER_PX）", () => {
  const c = { x: 500, y: 500 };
  const r = spawnWave([zone(0, 10, c)], new Rng("s"));
  for (const e of r.enemies) {
    assert.ok(Math.abs(e.pos.x - c.x) <= SPAWN_SCATTER_PX, `x 散布越界: ${e.pos.x}`);
    assert.ok(Math.abs(e.pos.y - c.y) <= SPAWN_SCATTER_PX, `y 散布越界: ${e.pos.y}`);
  }
});

test("spawnWave: lootPreview 为空（spawning 不负责掉装，仅 type-only 引用 loot）", () => {
  const r = spawnWave([zone(0, 2)], new Rng("s"));
  assert.deepEqual(r.lootPreview, []);
});

test("nextRespawnTick: 优先用 zone.respawnTicks，否则默认", () => {
  const z = zone(0, 1);
  const withExplicit = { ...z, respawnTicks: 50 };
  assert.equal(nextRespawnTick(10, withExplicit), 10 + 50);
  assert.equal(nextRespawnTick(10, z), 10 + DEFAULT_RESPAWN_TICKS);
});
