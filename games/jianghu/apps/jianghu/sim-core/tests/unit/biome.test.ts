/**
 * biome.test.ts — E28 内容扩展 P0（副本变体「石牢」+ 精英 BOSS「铁骨魁」）
 * ===========================================================================
 * 覆盖（确定性断言，D9）：
 *   ① 石牢 biomeId=1 生成：密度 1.5 + BOSS=ironbone（铁骨魁）+ 近战敌人池（无 shadow）；
 *   ② 铁骨魁数值：HP×1.2=360 / ATK×1.1=88 / telegraph 半径 96px（dungeon-variants §2）；
 *   ③ 铁骨魁击杀经验回退 BOSS 档 80（design 未指定 XP → ENEMY_XP.boss）；
 *   ④ 石牢 BOSS 暗金倾向：bossRarityWeightsForBiome(1)=[0,0,40,60]（普通 [0,0,55,45]）；
 *   ⑤ 默认 biome=0 回归不变：密度 1.2 + BOSS=dungeon_boss + 默认 BOSS 数值（golden 锚点）；
 *   ⑥ 铁骨魁 phase2 telegraph 半径经 world 生效（aoeRadius 覆盖 96px；默认回退 72px 由 telegraph.test 守护）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildDungeonSpec } from "../../src/dungeonGen.ts";
import { spawnWave } from "../../src/spawning.ts";
import { Rng } from "../../src/rng.ts";
import { createWorld } from "../../src/world.ts";
import { EntityKind, EntityStatus, InputAction, RoomPhase } from "../../src/types.ts";
import {
  TILE,
  BIOME_DEFAULT,
  BIOME_STONE_PRISON,
  BIOME_BARROW,
  BIOME_MOLTEN_CAVERN,
  ENEMY_BASE_HP,
  ENEMY_BASE_ATK,
  HP_MULT,
  ENEMY_XP,
  ENEMY_TYPE_VARIANTS,
  bossRarityWeightsForBiome,
  STONE_PRISON_BOSS_WEIGHTS,
  STONE_PRISON_SPAWN_DENSITY,
  DUNGEON_SPAWN_DENSITY,
  xpForLevel,
  SLOW_TICKS,
  SLOW_MOVE_MULT,
  CELLS_PER_TICK,
  TELEGRAPH_TICKS,
  affixWeightsForBiome,
  BARROW_AFFIX_BOOST_MULT,
  MOLTEN_AFFIX_BOOST_MULT,
  MOLTEN_ATTACK_SPEED_BOOST_MULT,
  MAGMA_BURN_INTERVAL_TICKS,
  MAGMA_BURN_TELEGRAPH_TICKS,
  MAGMA_BURN_RADIUS,
  MAGMA_BURN_DAMAGE_MULT,
} from "../../src/constants.ts";

// ─────────────────────────────────────────────────────────────
// ① 石牢 biomeId 生成：高密度 + 铁骨魁 BOSS + 近战池
// ─────────────────────────────────────────────────────────────

test("① 石牢 biomeId=1：密度 1.5 + BOSS=ironbone + 近战敌人池（dungeon-variants §1）", () => {
  for (let i = 0; i < 20; i++) {
    const spec = buildDungeonSpec(`stone-${i}`, BIOME_STONE_PRISON);
    assert.equal(spec.spawnDensityMultiplier, STONE_PRISON_SPAWN_DENSITY, `密度=1.5（seed stone-${i}）`);
    const bossZones = spec.spawnZones.filter((z) => z.tier === 2);
    assert.equal(bossZones.length, 1, `恰好一个 BOSS 区（seed stone-${i}）`);
    assert.equal(bossZones[0].enemyTypeId, "ironbone", `BOSS=铁骨魁 ironbone（seed stone-${i}）`);
    for (const z of spec.spawnZones) {
      if (z.tier !== 2) {
        assert.ok(["savage", "brigand"].includes(z.enemyTypeId), `近战池仅 savage/brigand，实际=${z.enemyTypeId}`);
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────
// ② 铁骨魁数值
// ─────────────────────────────────────────────────────────────

test("② 铁骨魁数值：HP×1.2=360 / ATK×1.1=88 / telegraph 半径 96（dungeon-variants §2）", () => {
  const variant = ENEMY_TYPE_VARIANTS.ironbone;
  assert.deepEqual(
    { hpMult: variant.hpMult, atkMult: variant.atkMult, aoeRadius: variant.aoeRadius },
    { hpMult: 1.2, atkMult: 1.1, aoeRadius: Math.round(2 * TILE) },
    "铁骨魁变体表：HP×1.2 / ATK×1.1 / AOE 半径 96px",
  );

  const r = spawnWave(
    [{ pos: { x: 100, y: 100 }, tier: 2, enemyTypeId: "ironbone", count: 1 }],
    new Rng("ironbone"),
  );
  const b = r.enemies[0];
  assert.equal(b.kind, EntityKind.BOSS, "tier=2 → BOSS");
  assert.equal(b.maxHp, Math.round(ENEMY_BASE_HP * HP_MULT.boss * 1.2), "HP=30×10×1.2=360");
  assert.equal(b.hp, b.maxHp, "初始 hp=maxHp");
  assert.equal(b.atk, Math.round(ENEMY_BASE_ATK * HP_MULT.boss * 1.1), "ATK=8×10×1.1=88");
  assert.equal(b.aoeRadius, Math.round(2 * TILE), "AOE 半径覆盖=96px");
  assert.equal(b.enemyXp, undefined, "design 未指定 XP → 回退 ENEMY_XP.boss=80");
});

// ─────────────────────────────────────────────────────────────
// ③ 铁骨魁击杀经验回退 BOSS 档
// ─────────────────────────────────────────────────────────────

test("③ 铁骨魁击杀经验回退 BOSS 档 80（design 未指定 XP）", () => {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: "xp-ironbone",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    biomeId: BIOME_STONE_PRISON,
    spawnZones: [
      { pos: { x: 20 * TILE, y: 15 * TILE }, tier: 2, enemyTypeId: "ironbone", count: 1, respawnTicks: 100000, aggression: "passive" },
    ],
  });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  assert.equal(boss.maxHp, Math.round(ENEMY_BASE_HP * HP_MULT.boss * 1.2), "前置：铁骨魁 HP=360");
  boss.hp = 0;
  boss.lastDamagerSeatId = 0; // 直接置击杀归属（同 death.test 改 actor 字段先例）
  world.step();
  const p = world.actors().find((a) => a.ownerId === 0)!;
  // 铁骨魁回退 ENEMY_XP.boss=80 → 跨过 L1 阈值 xpForLevel(1)=50 → 升级 L2，剩余 30。
  assert.equal(p.level, 2, "80xp ≥ 50 → 升级 L2（铁骨魁按 BOSS 档经验）");
  assert.equal(p.xp, ENEMY_XP.boss - xpForLevel(1), `剩余 xp=${ENEMY_XP.boss - xpForLevel(1)}（80-50）`);
  const lv = world.consumeLevelUps();
  assert.equal(lv.length, 1, "产生 1 次升级事件");
  assert.equal(lv[0].level, 2, "升级到 L2");
});

// ─────────────────────────────────────────────────────────────
// ④ 石牢 BOSS 暗金倾向
// ─────────────────────────────────────────────────────────────

test("④ 石牢 BOSS 暗金倾向：biome1=[0,0,40,60]；默认 biome0=undefined（用 [0,0,55,45]）", () => {
  assert.deepEqual(bossRarityWeightsForBiome(BIOME_STONE_PRISON), STONE_PRISON_BOSS_WEIGHTS);
  assert.deepEqual([...(bossRarityWeightsForBiome(BIOME_STONE_PRISON) ?? [])], [0, 0, 40, 60]);
  assert.equal(bossRarityWeightsForBiome(BIOME_DEFAULT), undefined, "普通副本回退 RARITY_WEIGHTS_BY_TIER.boss");
  assert.equal(bossRarityWeightsForBiome(999), undefined, "未知 biome 回退默认");
});

// ─────────────────────────────────────────────────────────────
// ⑤ 默认 biome 回归不变
// ─────────────────────────────────────────────────────────────

test("⑤ 默认 biome=0 回归不变：密度 1.2 + BOSS=dungeon_boss + 默认 BOSS 数值（golden 锚点）", () => {
  const spec = buildDungeonSpec("regress", BIOME_DEFAULT);
  assert.equal(spec.spawnDensityMultiplier, DUNGEON_SPAWN_DENSITY, "普通副本密度=1.2");
  const bossZone = spec.spawnZones.find((z) => z.tier === 2)!;
  assert.equal(bossZone.enemyTypeId, "dungeon_boss", "普通副本 BOSS=dungeon_boss");

  const r = spawnWave(
    [{ pos: { x: 0, y: 0 }, tier: 2, enemyTypeId: "dungeon_boss", count: 1 }],
    new Rng("db"),
  );
  const b = r.enemies[0];
  assert.equal(b.maxHp, ENEMY_BASE_HP * HP_MULT.boss, "默认 BOSS HP=300");
  assert.equal(b.atk, ENEMY_BASE_ATK * HP_MULT.boss, "默认 BOSS ATK=80");
  assert.equal(b.aoeRadius, undefined, "默认 BOSS 无 telegraph 半径覆盖（回退 TELEGRAPH_RADIUS=72）");
});

// ─────────────────────────────────────────────────────────────
// ⑥ 铁骨魁 phase2 telegraph 半径经 world 生效
// ─────────────────────────────────────────────────────────────

test("⑥ 铁骨魁 phase2 telegraph 半径=96px（aoeRadius 覆盖；默认回退由 telegraph.test 守护）", () => {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: "tg-ironbone",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    biomeId: BIOME_STONE_PRISON,
    spawnZones: [
      { pos: { x: 20 * TILE, y: 15 * TILE }, tier: 2, enemyTypeId: "ironbone", count: 1, respawnTicks: 100000, aggression: "passive" },
    ],
  });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  const player = world.actors().find((a) => a.ownerId === 0)!;
  player.x = boss.x + 60; // 圈内（≤96）+ 仇恨内（≤240）
  player.y = boss.y;
  boss.bossPhase = 1; // 强制 phase2（同 telegraph.test 先例）
  world.step();
  const tg = world.actors().find((a) => a.kind === EntityKind.TELEGRAPH);
  assert.ok(tg, "phase2 战斗态应生成 telegraph");
  assert.equal(tg.telegraph!.radius, Math.round(2 * TILE), "铁骨魁 telegraph radius=96px（裂地重锤）");
});

// ─────────────────────────────────────────────────────────────
// E31 扩展：荒冢副本 + 幽冢鬼母 + SLOW
// ─────────────────────────────────────────────────────────────

// ⑦ 荒冢 biomeId 生成
test("⑦ 荒冢 biomeId=2：密度 1.2 + BOSS=ghostmother + 幽灵敌人池（dungeon-variants §1 变体 B）", () => {
  for (let i = 0; i < 20; i++) {
    const spec = buildDungeonSpec(`barrow-${i}`, BIOME_BARROW);
    assert.equal(spec.spawnDensityMultiplier, DUNGEON_SPAWN_DENSITY, `密度=1.2（seed barrow-${i}）`);
    const bossZones = spec.spawnZones.filter((z) => z.tier === 2);
    assert.equal(bossZones.length, 1, `恰好一个 BOSS 区（seed barrow-${i}）`);
    assert.equal(bossZones[0].enemyTypeId, "ghostmother", `BOSS=幽冢鬼母 ghostmother（seed barrow-${i}）`);
    for (const z of spec.spawnZones) {
      if (z.tier !== 2) {
        assert.ok(["shadow", "savage"].includes(z.enemyTypeId), `幽灵池 shadow/savage，实际=${z.enemyTypeId}`);
      }
    }
  }
});

// ⑧ 幽冢鬼母数值
test("⑧ 幽冢鬼母数值：HP×0.9=270 / ATK×1.2=96 / 鬼啸锥形 120px ×1.2 + slowOnHit（dungeon-variants §2）", () => {
  const variant = ENEMY_TYPE_VARIANTS.ghostmother;
  assert.equal(variant.hpMult, 0.9, "HP×0.9");
  assert.equal(variant.atkMult, 1.2, "ATK×1.2");
  assert.equal(variant.aoeRadius, Math.round(2.5 * TILE), "鬼啸扇形半径=120px");
  assert.equal(variant.aoeShape, 2, "shape=2 锥形");
  assert.equal(variant.aoeDamageMult, 1.2, "鬼啸伤害 ×1.2");
  assert.equal(variant.slowOnHit, true, "接触命中附加 SLOW");

  const r = spawnWave(
    [{ pos: { x: 100, y: 100 }, tier: 2, enemyTypeId: "ghostmother", count: 1 }],
    new Rng("ghostmother"),
  );
  const b = r.enemies[0];
  assert.equal(b.kind, EntityKind.BOSS, "tier=2 → BOSS");
  assert.equal(b.maxHp, Math.round(ENEMY_BASE_HP * HP_MULT.boss * 0.9), "HP=30×10×0.9=270");
  assert.equal(b.hp, b.maxHp, "初始 hp=maxHp");
  assert.equal(b.atk, Math.round(ENEMY_BASE_ATK * HP_MULT.boss * 1.2), "ATK=8×10×1.2=96");
  assert.equal(b.aoeShape, 2, "aoeShape 透传=2");
  assert.equal(b.aoeDamageMult, 1.2, "aoeDamageMult 透传=1.2");
  assert.equal(b.slowOnHit, true, "slowOnHit 透传=true");
});

// ⑨ 荒冢减速词缀倾向
test("⑨ 荒冢减速词缀倾向：biome2 加权（reduction 23-30 / moveSpeed 51-64 ×3）；默认/未知=undefined", () => {
  assert.equal(affixWeightsForBiome(BIOME_DEFAULT), undefined, "普通副本回退均匀词缀");
  assert.equal(affixWeightsForBiome(999), undefined, "未知 biome 回退均匀词缀");
  const w = affixWeightsForBiome(BIOME_BARROW)!;
  assert.equal(w.length, 64, "权重数组长度=AFFIX_ID_MAX=64");
  assert.equal(w[0], 1, "atk(1) 权重保持 1");
  assert.equal(w[22], BARROW_AFFIX_BOOST_MULT, "reduction(23) 权重 ×3");
  assert.equal(w[29], BARROW_AFFIX_BOOST_MULT, "reduction(30) 权重 ×3");
  assert.equal(w[50], BARROW_AFFIX_BOOST_MULT, "moveSpeed(51) 权重 ×3");
  assert.equal(w[63], BARROW_AFFIX_BOOST_MULT, "moveSpeed(64) 权重 ×3");
  assert.equal(w[30], 1, "critChance(31) 权重保持 1（非 boost 区）");
});

// ⑩ 幽冢鬼母接触「鬼爪」命中 → 玩家 SLOW + 减速生效
test("⑩ 幽冢鬼母接触「鬼爪」命中 → 玩家 status 含 SLOW + 减速生效（dungeon-variants §2）", () => {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: "slow-contact",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    biomeId: BIOME_BARROW,
    spawnZones: [
      { pos: { x: 20 * TILE, y: 15 * TILE }, tier: 2, enemyTypeId: "ghostmother", count: 1, respawnTicks: 100000, aggression: "aggressive" },
    ],
  });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  const player = world.actors().find((a) => a.ownerId === 0)!;
  player.x = boss.x + 40; // 接触范围（≤48px）内
  player.y = boss.y;
  player.maxHp = 1000;
  player.hp = 1000;

  // t=0 决策进入前摇（windupUntilTick=5）→ t=5 落刀命中（接触 48px 内）。
  for (let i = 0; i < 6; i++) world.step();

  const p2 = world.actors().find((a) => a.ownerId === 0)!;
  assert.ok(p2.status & EntityStatus.SLOW, "接触命中后玩家 status 含 SLOW");
  assert.equal(p2.hp, 1000 - Math.round(ENEMY_BASE_ATK * HP_MULT.boss * 1.2), "接触伤害=96（无减伤）");
  assert.equal(p2.slowUntilTick, 5 + SLOW_TICKS, "SLOW 截止 tick = 命中 tick + SLOW_TICKS（3s=36）");

  // 减速生效：SLOW 位置位时 MOVE dir=0 位移 = CELLS_PER_TICK×TILE×SLOW_MOVE_MULT（0.6 倍）。
  const x0 = p2.x;
  world.enqueueInput(0, { seq: 1, tick: 0, action: InputAction.MOVE, dir: 0 });
  world.step();
  const p3 = world.actors().find((a) => a.ownerId === 0)!;
  const dx = p3.x - x0;
  assert.ok(
    Math.abs(dx - CELLS_PER_TICK * TILE * SLOW_MOVE_MULT) < 0.01,
    `SLOW 减速位移≈9.6px（实测 ${dx}）`,
  );
});

// ⑪ 幽冢鬼母鬼啸扇形 telegraph：shape=2 锥形 + radius=120 + 命中 SLOW
test("⑪ 幽冢鬼母鬼啸扇形：telegraph shape=2 + radius=120 + 命中 SLOW（dungeon-variants §2）", () => {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: "slow-cone",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    biomeId: BIOME_BARROW,
    spawnZones: [
      { pos: { x: 20 * TILE, y: 15 * TILE }, tier: 2, enemyTypeId: "ghostmother", count: 1, respawnTicks: 100000, aggression: "passive" },
    ],
  });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  const player = world.actors().find((a) => a.ownerId === 0)!;
  player.x = boss.x + 60; // 锥形半径 120 内 + 仇恨内（≤240）、接触 48 外（隔离接触攻击）
  player.y = boss.y;
  player.maxHp = 1000;
  player.hp = 1000;
  boss.bossPhase = 1; // 强制 phase2（同 telegraph.test 先例）

  world.step(); // t=0 生成鬼啸 telegraph
  const tg = world.actors().find((a) => a.kind === EntityKind.TELEGRAPH);
  assert.ok(tg, "phase2 战斗态应生成 telegraph");
  assert.equal(tg.telegraph!.shape, 2, "鬼啸扇形 shape=2（锥形）");
  assert.equal(tg.telegraph!.radius, Math.round(2.5 * TILE), "鬼啸半径=120px");

  // 推进 TELEGRAPH_TICKS 落刀（t=12 命中圈内玩家 → 伤害 + SLOW）。
  for (let i = 0; i < TELEGRAPH_TICKS; i++) world.step();
  const p = world.actors().find((a) => a.ownerId === 0)!;
  const expectedDmg = Math.round(Math.round(ENEMY_BASE_ATK * HP_MULT.boss * 1.2) * 1.2);
  assert.equal(p.hp, 1000 - expectedDmg, `鬼啸伤害 = atk(96)×1.2=${expectedDmg}`);
  assert.ok(p.status & EntityStatus.SLOW, "鬼啸命中后玩家 status 含 SLOW");
});

// ─────────────────────────────────────────────────────────────
// E33 扩展：熔窟副本 + 熔岩巨像 + 灼烧地面（DOT 降级版）
// ─────────────────────────────────────────────────────────────

// ⑫ 熔窟 biomeId 生成
test("⑫ 熔窟 biomeId=3：密度 1.2 + BOSS=magmacolossus + 火系敌人池（dungeon-variants §1 变体 C）", () => {
  for (let i = 0; i < 20; i++) {
    const spec = buildDungeonSpec(`molten-${i}`, BIOME_MOLTEN_CAVERN);
    assert.equal(spec.spawnDensityMultiplier, DUNGEON_SPAWN_DENSITY, `密度=1.2（seed molten-${i}）`);
    const bossZones = spec.spawnZones.filter((z) => z.tier === 2);
    assert.equal(bossZones.length, 1, `恰好一个 BOSS 区（seed molten-${i}）`);
    assert.equal(bossZones[0].enemyTypeId, "magmacolossus", `BOSS=熔岩巨像 magmacolossus（seed molten-${i}）`);
    for (const z of spec.spawnZones) {
      if (z.tier !== 2) {
        assert.ok(["brigand", "savage"].includes(z.enemyTypeId), `火系池 brigand/savage，实际=${z.enemyTypeId}`);
      }
    }
  }
});

// ⑬ 熔岩巨像数值
test("⑬ 熔岩巨像数值：HP×1.3=390 / ATK×1.3=104 / 环形喷发 shape=0 96px ×1.5 + 灼烧（dungeon-variants §2）", () => {
  const variant = ENEMY_TYPE_VARIANTS.magmacolossus;
  assert.equal(variant.hpMult, 1.3, "HP×1.3");
  assert.equal(variant.atkMult, 1.3, "ATK×1.3");
  assert.equal(variant.aoeRadius, Math.round(2 * TILE), "环形喷发半径=96px");
  assert.equal(variant.aoeShape, 0, "shape=0 圆环（内圈安全）");
  assert.equal(variant.aoeDamageMult, 1.5, "环形喷发伤害 ×1.5");
  assert.ok(variant.burnAoe, "灼烧地面已登记（DOT 降级版）");
  assert.equal(variant.burnAoe!.intervalTicks, MAGMA_BURN_INTERVAL_TICKS, "灼烧间隔=6 tick（高频）");
  assert.equal(variant.burnAoe!.telegraphTicks, MAGMA_BURN_TELEGRAPH_TICKS, "灼烧前摇=8 tick（可读下界 666ms）");
  assert.equal(variant.burnAoe!.radius, MAGMA_BURN_RADIUS, "灼烧半径=72px");
  assert.equal(variant.burnAoe!.damageMult, MAGMA_BURN_DAMAGE_MULT, "灼烧伤害 ×0.15（低伤）");
  assert.equal(variant.burnAoe!.shape, 1, "灼烧 shape=1 AOE 填充");

  const r = spawnWave(
    [{ pos: { x: 100, y: 100 }, tier: 2, enemyTypeId: "magmacolossus", count: 1 }],
    new Rng("magmacolossus"),
  );
  const b = r.enemies[0];
  assert.equal(b.kind, EntityKind.BOSS, "tier=2 → BOSS");
  assert.equal(b.maxHp, Math.round(ENEMY_BASE_HP * HP_MULT.boss * 1.3), "HP=30×10×1.3=390");
  assert.equal(b.hp, b.maxHp, "初始 hp=maxHp");
  assert.equal(b.atk, Math.round(ENEMY_BASE_ATK * HP_MULT.boss * 1.3), "ATK=8×10×1.3=104");
  assert.equal(b.aoeShape, 0, "aoeShape 透传=0");
  assert.equal(b.aoeDamageMult, 1.5, "aoeDamageMult 透传=1.5");
  assert.deepEqual(b.burnAoe, variant.burnAoe, "burnAoe 透传（DOT 降级版参数）");
});

// ⑭ 熔窟爆发词缀倾向
test("⑭ 熔窟爆发词缀倾向：biome3 atk 1-12/critChance 31-40 ×3、attackSpeed 41-50 ×2；默认/未知=undefined", () => {
  assert.equal(affixWeightsForBiome(BIOME_DEFAULT), undefined, "普通副本回退均匀词缀");
  assert.equal(affixWeightsForBiome(999), undefined, "未知 biome 回退均匀词缀");
  const w = affixWeightsForBiome(BIOME_MOLTEN_CAVERN)!;
  assert.equal(w.length, 64, "权重数组长度=AFFIX_ID_MAX=64");
  assert.equal(w[0], MOLTEN_AFFIX_BOOST_MULT, "atk(1) 权重 ×3");
  assert.equal(w[11], MOLTEN_AFFIX_BOOST_MULT, "atk(12) 权重 ×3");
  assert.equal(w[30], MOLTEN_AFFIX_BOOST_MULT, "critChance(31) 权重 ×3");
  assert.equal(w[39], MOLTEN_AFFIX_BOOST_MULT, "critChance(40) 权重 ×3");
  assert.equal(w[40], MOLTEN_ATTACK_SPEED_BOOST_MULT, "attackSpeed(41) 权重 ×2");
  assert.equal(w[49], MOLTEN_ATTACK_SPEED_BOOST_MULT, "attackSpeed(50) 权重 ×2");
  assert.equal(w[12], 1, "maxHp(13) 权重保持 1（非 boost 区）");
  assert.equal(w[22], 1, "reduction(23) 权重保持 1（非 boost 区）");
});

// ⑮ 熔岩巨像灼烧地面（DOT 降级版）：高频短前摇 telegraph 命中玩家火伤
test("⑮ 熔岩巨像灼烧地面：高频短前摇 telegraph 命中玩家火伤（不新增 DOT 世界机制）", () => {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: "burn-magma",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    biomeId: BIOME_MOLTEN_CAVERN,
    spawnZones: [
      { pos: { x: 20 * TILE, y: 15 * TILE }, tier: 2, enemyTypeId: "magmacolossus", count: 1, respawnTicks: 100000, aggression: "passive" },
    ],
  });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  const player = world.actors().find((a) => a.ownerId === 0)!;
  player.x = boss.x + 40; // 灼烧半径 72 内 + 仇恨内（≤240）
  player.y = boss.y;
  player.maxHp = 10000;
  player.hp = 10000;
  boss.bossPhase = 1; // 强制 phase2（同 telegraph.test 先例）

  world.step(); // t=0 生成主技能（环形 shape=0）+ 灼烧（shape=1）telegraph
  const telegraphs = world.actors().filter((a) => a.kind === EntityKind.TELEGRAPH);
  const ring = telegraphs.find((a) => a.telegraph!.shape === 0);
  const burn = telegraphs.find((a) => a.telegraph!.shape === 1);
  assert.ok(ring, "phase2 战斗态应生成环形喷发 telegraph（shape=0）");
  assert.equal(ring.telegraph!.radius, Math.round(2 * TILE), "环形喷发 radius=96px");
  assert.ok(burn, "phase2 战斗态应生成灼烧 telegraph（shape=1 AOE 填充）");
  assert.equal(burn.telegraph!.radius, MAGMA_BURN_RADIUS, "灼烧半径=72px");
  assert.equal(burn.telegraph!.applyTick, MAGMA_BURN_TELEGRAPH_TICKS, "灼烧前摇=8 tick（applyTick=t+8）");

  // 推进 MAGMA_BURN_TELEGRAPH_TICKS 落刀（t=8 命中圈内玩家 → 火伤）。
  for (let i = 0; i < MAGMA_BURN_TELEGRAPH_TICKS; i++) world.step();
  const p = world.actors().find((a) => a.ownerId === 0)!;
  const atk = Math.round(ENEMY_BASE_ATK * HP_MULT.boss * 1.3); // 104
  const expectedBurn = Math.round(atk * MAGMA_BURN_DAMAGE_MULT); // round(104×0.15)=16
  assert.equal(p.hp, 10000 - expectedBurn, `灼烧伤害 = atk(104)×0.15=${expectedBurn}（环形尚未落刀，仅灼烧扣血）`);
});

// ⑯ 熔岩巨像灼烧高频复现：间隔内反复生成灼烧 telegraph（每 MAGMA_BURN_INTERVAL_TICKS 一记）
test("⑯ 熔岩巨像灼烧高频复现：间隔 6 tick 反复生成灼烧 telegraph（模拟持续灼烧）", () => {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: "burn-repeat",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    biomeId: BIOME_MOLTEN_CAVERN,
    spawnZones: [
      { pos: { x: 20 * TILE, y: 15 * TILE }, tier: 2, enemyTypeId: "magmacolossus", count: 1, respawnTicks: 100000, aggression: "passive" },
    ],
  });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  const player = world.actors().find((a) => a.ownerId === 0)!;
  player.x = boss.x + 40;
  player.y = boss.y;
  player.maxHp = 100000;
  player.hp = 100000;
  boss.bossPhase = 1;

  // 推进 3 个灼烧间隔（18 tick）：应至少生成 3 次灼烧 telegraph（t=0/6/12）。
  for (let i = 0; i < MAGMA_BURN_INTERVAL_TICKS * 3; i++) world.step();
  // 每次灼烧 telegraph（前摇 8 tick 可读）落刀造成火伤；玩家全程站圈内持续掉血。
  const p = world.actors().find((a) => a.ownerId === 0)!;
  const atk = Math.round(ENEMY_BASE_ATK * HP_MULT.boss * 1.3);
  const perHit = Math.round(atk * MAGMA_BURN_DAMAGE_MULT);
  // t=0/6/12 生成灼烧，t=8/14 落刀 → 2 次火伤（第 3 记 applyTick=20 落在 18 tick 窗口外）；
  // 主技能环形（applyTick=12）在 t=12 也落刀一次（半径 96 覆盖 40）。
  const ringHits = 1; // 主技能环形在 t=12 落刀一次
  const ringDmg = Math.round(atk * 1.5);
  const burnHits = 2;
  assert.equal(
    p.hp,
    100000 - burnHits * perHit - ringHits * ringDmg,
    `2 次灼烧(${perHit}) + 1 次环形(${ringDmg}) 持续掉血`,
  );
});

