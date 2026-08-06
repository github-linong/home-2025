/**
 * enemy-ai.test.ts — E6 敌人 AI（系统⑧，sim-core 单测）
 *
 * 覆盖（S6.1–S6.5 / 闭合设计评审 O-E / O-D）：
 *  - 敌人朝最近存活玩家移动（stepEnemyAi 产 MOVE 意图）
 *  - 敌人在攻击范围内发起 ATTACK 意图，携带 targetId + 原型伤害
 *  - 敌人忽略 DOWNED 玩家，只瞄准存活玩家
 *  - 端到端：敌人攻击经 ≥ tier telegraphTicks 后使玩家 hp 下降（O-E 闭合）
 *  - 端到端：telegraph 未到 applyTick 不造成伤害（D12 对敌人同样适用）
 *  - 敌人伤害取原型值（非玩家 18）—— 敌我伤害分离
 *
 * 运行：node --experimental-strip-types --test tests/unit/enemy-ai.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { stepEnemyAi, type EnemyAiSelf, type EnemyAiPlayer } from "../../src/enemy-ai.ts";
import { ENEMY_PROTOTYPES, EntityKind, EntityStatus } from "../../src/types.ts";

// ============================================================
// 单元：stepEnemyAi 意图产出的纯逻辑（不依赖 world）
// ============================================================

test("stepEnemyAi moves toward the nearest alive player (MOVE intent)", () => {
  const self: EnemyAiSelf = { id: 9, x: 0, y: 0, enemyTypeId: "grunt_swarm" };
  // 二者均超出 grunt.attackRange(40)：玩家1 在 (300,0) 距 300；玩家2 在 (-100,50) 距 ~111.8
  // → 最近是玩家2。
  const players: EnemyAiPlayer[] = [
    { id: 1, x: 300, y: 0, alive: true },
    { id: 2, x: -100, y: 50, alive: true },
  ];
  const intent = stepEnemyAi(self, { tick: 0, players });
  assert.equal(intent.type, "MOVE", "out of range → MOVE");
  const dir = intent.type === "MOVE" ? intent.dir : { x: 0, y: 0 };
  assert.ok(dir.x < 0 && dir.y > 0, "direction points toward nearest player (player2, -x/+y)");
  // 单位向量（归一化）。
  assert.ok(Math.abs(Math.hypot(dir.x, dir.y) - 1) < 1e-9, "dir is unit length");
});

test("stepEnemyAi attacks when target is within attack range (ATTACK intent w/ prototype damage)", () => {
  const self: EnemyAiSelf = { id: 9, x: 0, y: 0, enemyTypeId: "grunt_swarm" };
  // 玩家在 (10,0) 距 10 ≤ grunt.attackRange(40) → 发起攻击。
  const players: EnemyAiPlayer[] = [{ id: 1, x: 10, y: 0, alive: true }];
  const intent = stepEnemyAi(self, { tick: 0, players });
  assert.equal(intent.type, "ATTACK", "in range → ATTACK");
  if (intent.type === "ATTACK") {
    assert.equal(intent.targetId, 1, "targets the in-range player");
    assert.equal(
      intent.damage,
      ENEMY_PROTOTYPES.grunt_swarm.attackDamage,
      "damage = prototype value (8), not player 18",
    );
  }
});

test("stepEnemyAi ignores DOWNED players and targets only the alive one", () => {
  const self: EnemyAiSelf = { id: 9, x: 0, y: 0, enemyTypeId: "grunt_swarm" };
  const players: EnemyAiPlayer[] = [
    { id: 1, x: 5, y: 0, alive: false }, // 近但已倒地 → 不瞄准
    { id: 2, x: -20, y: 0, alive: true }, // 远但存活 → 唯一目标
  ];
  const intent = stepEnemyAi(self, { tick: 0, players });
  assert.equal(intent.type, "ATTACK");
  if (intent.type === "ATTACK") {
    assert.equal(intent.targetId, 2, "only the alive player is targeted");
  }
});

// ============================================================
// 端到端：经 world.step 走完整 telegraph → resolveDamage 路径（O-E / D12 / 敌我伤害分离）
// ============================================================

/** 构造 1 玩家(tank)世界，并把指定敌人（存活引用）挪到玩家身旁（利用 actors() 返回活引用）。 */
function worldWithEnemyBesidePlayer() {
  const world = createWorld({
    runId: "E6-AI-EOE",
    seed: "EMBER-S1", // 该 seed+biome 产出 grunt_swarm（与 playtest 台一致）
    biomeId: 0,
    players: [{ seatId: 0, userId: "P1", classId: "tank" }],
  });
  const player = world.actors().find((a) => a.ownerId === 0)!;
  const enemy = world.actors().find(
    (a) => a.kind === EntityKind.ENEMY && a.enemyTypeId === "grunt_swarm",
  )!;
  // actors() 返回活引用（slice 仅复制数组，元素为同一对象）→ 直接搬迁到玩家身旁、进入攻击范围。
  enemy.x = player.x + 5;
  enemy.y = player.y;
  return { world, player, enemy };
}

test("E2E: enemy deals damage to player after ≥ tier telegraphTicks (O-E closed)", () => {
  const { world, player } = worldWithEnemyBesidePlayer();
  const hp0 = player.hp;
  // grunt telegraphTicks=21；步进 30 tick 足够前摇完成并结算（仅一次命中）。
  for (let i = 0; i < 30; i++) world.step();
  assert.ok(player.hp < hp0, "player took damage from enemy AI");
  assert.equal(
    player.hp,
    hp0 - ENEMY_PROTOTYPES.grunt_swarm.attackDamage,
    "enemy dealt prototype damage (8), NOT player PLAYER_ATTACK_DAMAGE (18)",
  );
});

test("E2E: telegraph not applied before applyTick → no damage (D12 holds for enemies)", () => {
  const { world, player } = worldWithEnemyBesidePlayer();
  const hp0 = player.hp;
  // 仅步进 10 tick（< grunt 21 tick 前摇）→ 伤害应为 no-op。
  for (let i = 0; i < 10; i++) world.step();
  assert.equal(player.hp, hp0, "no damage before telegraph applyTick (D12)");
  assert.ok(
    world.actors().some((a) => a.telegraph != null),
    "enemy telegraph is pending (windup not yet resolved)",
  );
});

test("E2E: enemy damage uses tier-specific prototype (grunt 8 ≠ player 18)", () => {
  const { world, player } = worldWithEnemyBesidePlayer();
  const hp0 = player.hp;
  for (let i = 0; i < 30; i++) world.step();
  const delta = hp0 - player.hp;
  assert.notEqual(delta, 18, "enemy damage must NOT be the player's 18");
  assert.equal(delta, ENEMY_PROTOTYPES.grunt_swarm.attackDamage, "enemy damage = grunt 8");
  // 额外确认敌人状态未受损（纪律：⑧ 不直改；此处仅玩家掉血）。
  const enemy = world.actors().find((a) => a.enemyTypeId === "grunt_swarm")!;
  assert.equal(enemy.status & EntityStatus.DOWNED, 0, "enemy itself is undamaged by its own AI");
});
