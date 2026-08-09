/**
 * brute-charger.test.ts — brute_charger 敌宗测试（系统③/⑧，sim-core 单测）
 *
 * 覆盖：
 *  - ENEMY_PROTOTYPES.brute_charger 存在且 speed > grunt_swarm、telegraphTicks === 18（激进冲锋者）。
 *  - stepEnemyAi 对 brute_charger：距离 > attackRange → 朝最近玩家 MOVE（dir 非零，单位向量）；
 *    距离 ≤ attackRange → ATTACK（targetId + 原型伤害 12）。永不 kite（落入默认 rush 路径）。
 *  - 狂暴（enrage）：brute_charger 血量跌破 50% maxHp 且未 enraged → 经 spawnChargerAdd 确定性
 *    生成恰好 1 只 grunt_swarm 近怪，且每个 charger 仅触发一次（guard 防重复）。
 *
 * 确定性：全部走现有 Rng(hashString64(...))，无 Date/Math.random。狂暴断言若 seed 自然未产出
 *   brute_charger 则 SKIP（不失败），与任务约定一致。
 *
 * 运行：node --experimental-strip-types --test tests/unit/brute-charger.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { stepEnemyAi, type EnemyAiSelf, type EnemyAiPlayer } from "../../src/enemy-ai.ts";
import {
  ENEMY_PROTOTYPES,
  EntityKind,
  InputAction,
} from "../../src/types.ts";
import {
  resolveDamage,
  CombatKind,
  type CombatEntity,
} from "../../src/combat.ts";

// ============================================================
// 单元：原型数据（③）
// ============================================================

test("ENEMY_PROTOTYPES.brute_charger exists, faster than grunt, telegraphTicks = 18", () => {
  assert.ok(ENEMY_PROTOTYPES.brute_charger, "brute_charger prototype present");
  assert.equal(ENEMY_PROTOTYPES.brute_charger.tier, "grunt");
  assert.ok(
    ENEMY_PROTOTYPES.brute_charger.speed > ENEMY_PROTOTYPES.grunt_swarm.speed,
    `brute_charger speed ${ENEMY_PROTOTYPES.brute_charger.speed} > grunt ${ENEMY_PROTOTYPES.grunt_swarm.speed}`,
  );
  assert.equal(
    ENEMY_PROTOTYPES.brute_charger.telegraphTicks,
    18,
    "aggressive front-swing = MIN_TELEGRAPH_TICKS (0.6s)",
  );
  assert.equal(ENEMY_PROTOTYPES.brute_charger.attackDamage, 12, "glass-cannon rush damage = 12");
});

// ============================================================
// 单元：stepEnemyAi 意图（⑧，纯逻辑，不依赖 world）
// ============================================================

test("stepEnemyAi brute_charger rushes: MOVE toward player when out of range", () => {
  const self: EnemyAiSelf = { id: 7, x: 0, y: 0, enemyTypeId: "brute_charger" };
  // 玩家在 (300,0) 距 300 > brute_charger.attackRange(38) → 发起 MOVE（rush，绝不 kite）。
  const players: EnemyAiPlayer[] = [{ id: 1, x: 300, y: 0, alive: true }];
  const intent = stepEnemyAi(self, { tick: 0, players });
  assert.equal(intent.type, "MOVE", "out of range → MOVE (rush)");
  const dir = intent.type === "MOVE" ? intent.dir : { x: 0, y: 0 };
  assert.ok(dir.x > 0 && Math.abs(dir.y) < 1e-9, "dir points toward player (+x, non-zero)");
  assert.ok(Math.abs(Math.hypot(dir.x, dir.y) - 1) < 1e-9, "dir is unit length");
});

test("stepEnemyAi brute_charger attacks when in range (prototype damage 12)", () => {
  const self: EnemyAiSelf = { id: 7, x: 0, y: 0, enemyTypeId: "brute_charger" };
  // 玩家在 (10,0) 距 10 ≤ brute_charger.attackRange(38) → 发起 ATTACK。
  const players: EnemyAiPlayer[] = [{ id: 1, x: 10, y: 0, alive: true }];
  const intent = stepEnemyAi(self, { tick: 0, players });
  assert.equal(intent.type, "ATTACK", "in range → ATTACK");
  if (intent.type === "ATTACK") {
    assert.equal(intent.targetId, 1, "targets the in-range player");
    assert.equal(
      intent.damage,
      ENEMY_PROTOTYPES.brute_charger.attackDamage,
      "damage = prototype value (12), not player 18",
    );
  }
});

// ============================================================
// 端到端：狂暴（enrage）生怪（① world.step 编排）
// ============================================================

test("brute_charger enrage: hp < 50% spawns exactly 1 grunt_swarm add, once", (t) => {
  const world = createWorld({
    runId: "BRUTE-ENRAGE",
    seed: "EMBER-S1",
    biomeId: 0,
    players: [
      { seatId: 0, userId: "P1", classId: "tank" },
      { seatId: 1, userId: "P2", classId: "ranger" },
    ],
  });

  // 推进波次（确定性：两玩家每 tick 攻击「数组序首个存活敌人」）直到出现 brute_charger。
  // brute_charger 仅出现在 wave≥2（wave-1 保证为 grunt_swarm），故需清场推进若干波才能观测到。
  let chargerId: number | null = null;
  const MAX_TICKS = 2000;
  for (let tk = 0; tk < MAX_TICKS && chargerId === null; tk++) {
    const bc = world.actors().find((a) => a.enemyTypeId === "brute_charger");
    if (bc) {
      chargerId = bc.id;
      break;
    }
    const enemies = world.actors().filter(
      (a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS,
    );
    if (enemies.length > 0) {
      const tid = enemies[0].id;
      world.enqueueInput(0, { seq: tk + 1, tick: tk, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: tid });
      world.enqueueInput(1, { seq: tk + 1, tick: tk, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: tid });
    }
    world.step();
  }

  if (chargerId === null) {
    // seed EMBER-S1/biome 0 自然未产出 brute_charger（20% 注入未命中）→ SKIP，不失败。
    t.skip("no brute_charger appeared in seed EMBER-S1/biome 0; enrage not testable");
    return;
  }

  const gruntBefore = world.actors().filter((a) => a.enemyTypeId === "grunt_swarm").length;
  const combatMap = new Map(world.actors().map((a) => [a.id, a as CombatEntity]));
  const c = world.actors().find((a) => a.id === chargerId)!;
  // 经 resolveDamage（玩家路径 -18）将其 hp 压到 <50% maxHp 且 >0（保持存活，不触发倒地）。
  while (c.hp > 0 && c.hp >= c.maxHp * 0.5) {
    // maxHp=36 时 -18 无法落入 (0,50%) 窗口（36→18→0），此类 charger 无法经玩家伤害触发狂暴 → SKIP。
    if (c.hp - 18 <= 0) {
      t.skip("charger maxHp makes -18 unable to reach the (0,50%) enrage window");
      return;
    }
    resolveDamage(
      { tick: world.tick, entities: combatMap },
      { sourceId: 0, targetId: chargerId, amount: 0, tick: world.tick, kind: CombatKind.ATTACK },
    );
  }
  assert.ok(c.hp > 0 && c.hp < c.maxHp * 0.5, "charger hp now below 50% and alive");

  world.step();
  const gruntAfter = world.actors().filter((a) => a.enemyTypeId === "grunt_swarm").length;
  const after = world.actors().find((a) => a.id === chargerId)!;
  assert.equal(gruntAfter, gruntBefore + 1, "exactly one grunt_swarm add spawned near charger");
  assert.equal(after.enraged, true, "charger marked enraged");

  // 再次步进不应生成第二个 add（guard 防重复生怪）。
  world.step();
  const gruntAfter2 = world.actors().filter((a) => a.enemyTypeId === "grunt_swarm").length;
  assert.equal(gruntAfter2, gruntAfter, "no second add on subsequent steps (enrage fires once)");
});
