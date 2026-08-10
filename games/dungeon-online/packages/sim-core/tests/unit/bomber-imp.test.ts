/**
 * bomber-imp.test.ts — bomber_imp（自爆兵）敌宗测试（系统③/⑧，M13，sim-core 单测）
 *
 * 覆盖（M13 自爆兵）：
 *  - (A) 原型数据（③）：bomber_imp 存在、shape === AOE_FILL、speed > grunt_swarm、telegraphTicks >= 18（D12 下限）。
 *  - (B) 敌人 AI（⑧）：玩家进入 attackRange 时，bomber 在 next step 起 telegraph（AOE_FILL）。
 *  - (C) 自爆（world.step 编排）：telegraph 抵达 applyTick → 半径内玩家受 AOE 伤害 + 自爆兵自毁移除。
 *
 * 确定性：测试仅做固定 seed（EMBER-S1/biome 0，与 brute-charger.test.ts 同约定）下的确定性注入与步进，
 *   不引入 Date/Math.random。bomber 仅在 wave≥2 经 dungeon-gen 注入，故测试直接取首个 ENEMY 活引用
 *   改写 enemyTypeId 为 bomber_imp（同 enemy-ai.test.ts 将 grunt 搬到玩家身旁的测试手法）。
 *
 * 运行：node --experimental-strip-types --test tests/unit/bomber-imp.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import {
  ENEMY_PROTOTYPES,
  EntityKind,
  EntityStatus,
  TelegraphShape,
  type Actor,
} from "../../src/types.ts";

/** 构造 2 玩家（tank+ranger）世界，并取首个 ENEMY（wave 1 必为 grunt_swarm）活引用。 */
function mkWorld() {
  const world = createWorld({
    runId: "BOMBER-IMP",
    seed: "EMBER-S1", // 与 brute-charger.test.ts 同约定
    biomeId: 0,
    players: [
      { seatId: 0, userId: "P1", classId: "tank" },
      { seatId: 1, userId: "P2", classId: "ranger" },
    ],
  });
  const actors = world.actors();
  const p0 = actors.find((a) => a.ownerId === 0)!;
  const p1 = actors.find((a) => a.ownerId === 1)!;
  const firstEnemy = actors.find((a) => a.kind === EntityKind.ENEMY)!;
  return { world, p0, p1, firstEnemy };
}

/** 把给定敌人活引用改写为 bomber_imp（仅测试用；复用 ENEMY_PROTOTYPES 的平衡初稿字段）。 */
function makeBomber(e: Actor): void {
  e.enemyTypeId = "bomber_imp";
  const proto = ENEMY_PROTOTYPES.bomber_imp;
  e.hp = proto.hpMin;
  e.maxHp = proto.hpMin;
  e.status = EntityStatus.ALIVE;
}

// ============================================================
// (A) 原型数据（③）
// ============================================================

test("(A) bomber_imp prototype sanity", () => {
  assert.ok(ENEMY_PROTOTYPES.bomber_imp, "bomber_imp prototype present");
  assert.equal(
    ENEMY_PROTOTYPES.bomber_imp.shape,
    TelegraphShape.AOE_FILL,
    "telegraph shape is AOE_FILL (1)",
  );
  assert.ok(
    ENEMY_PROTOTYPES.bomber_imp.speed > ENEMY_PROTOTYPES.grunt_swarm.speed,
    `bomber speed ${ENEMY_PROTOTYPES.bomber_imp.speed} > grunt ${ENEMY_PROTOTYPES.grunt_swarm.speed}`,
  );
  assert.ok(
    ENEMY_PROTOTYPES.bomber_imp.telegraphTicks >= 18,
    `telegraph ticks ${ENEMY_PROTOTYPES.bomber_imp.telegraphTicks} >= 18 (D12 floor)`,
  );
  assert.equal(ENEMY_PROTOTYPES.bomber_imp.tier, "grunt", "bomber is a grunt-tier rusher");
});

// ============================================================
// (B) 敌人 AI（⑧）：范围内起 telegraph
// ============================================================

test("(B) bomber_imp starts an AOE telegraph when a player is within attackRange", () => {
  const { world, p0, firstEnemy } = mkWorld();
  makeBomber(firstEnemy);
  // 玩家贴到 bomber 身旁（进入 attackRange=36）。
  p0.x = firstEnemy.x + 5;
  p0.y = firstEnemy.y;

  world.step(); // 下一 step：AI 产出 ATTACK → world 经 ⑦ 启动 telegraph。

  const after = world.actors().find((a) => a.id === firstEnemy.id)!;
  assert.ok(after.telegraph != null, "bomber started a telegraph on the next step");
  // 快照核对 telegraph 形状为 AOE_FILL（已接线的客户端渲染路径）。
  const snap = world.snapshot().entities.find((e) => e.id === firstEnemy.id);
  assert.ok(snap?.telegraph != null, "telegraph present in snapshot");
  assert.equal(snap!.telegraph!.shape, TelegraphShape.AOE_FILL, "snapshot telegraph shape = AOE_FILL");
});

// ============================================================
// (C) 自爆（world.step）：AOE 伤害 + 自毁
// ============================================================

test("(C) bomber_imp detonates: AOE damage to nearby players + self-removal", () => {
  const { world, p0, p1, firstEnemy } = mkWorld();
  makeBomber(firstEnemy);
  // bomber 居中，两名玩家均落入 blast 半径（attackRange=36）。
  firstEnemy.x = p0.x + 5;
  firstEnemy.y = p0.y;
  p1.x = firstEnemy.x + 10;
  p1.y = firstEnemy.y;

  const p0hp0 = p0.hp;
  const p1hp0 = p1.hp;

  // 推进超过 telegraphTicks(18)：applyTick 抵达时结算 AOE 并自毁。
  for (let i = 0; i < 30; i++) world.step();

  // (i) 至少一名邻近玩家受 AOE 伤害。
  assert.ok(
    p0.hp < p0hp0 || p1.hp < p1hp0,
    "at least one nearby player took AOE damage",
  );

  // (ii) 自爆兵已自毁移除（本 tick 末尾 dead-enemy 清理移除 DOWNED 敌人）。
  const bomberAfter = world.actors().find((a) => a.enemyTypeId === "bomber_imp");
  assert.equal(bomberAfter, undefined, "bomber self-removed from world entities");

  // 自毁路径经 world.step 落地：断言已无 bomber 残留（含 hp/status 已归零），验证清扫闭环。
  const inSnapshot = world.snapshot().entities.some((e) => e.enemyTypeId === "bomber_imp");
  assert.equal(inSnapshot, false, "bomber absent from snapshot entities after detonation");
});
