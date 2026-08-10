/**
 * gunner-imp.test.ts — gunner_imp（飞行弹道枪手）敌宗测试（系统③/⑧，M16，sim-core 单测）
 *
 * 覆盖（M16 飞行弹道新机制）：
 *  - (A) 原型数据（③）：gunner_imp 存在、shape === LINE、attackRange >= 140、telegraphTicks >= 16、
 *       speed 介于 grunt_swarm(70) 与 bomber_imp(135) 之间。
 *  - (B) 敌人 AI（⑧）：玩家在 attackRange 内但非贴脸 → 起 LINE telegraph；玩家贴脸 → 后撤（距离增大）。
 *  - (C) 弹道生命周期（world.step 编排）：telegraph 抵达 applyTick → 生成飞行弹道；步进后位移 +
 *       命中路径上玩家造成伤害（经 ⑦ resolveDamage，纪律 B）；越过 expireTick → 该弹道移除。
 *  - (D) 确定性：同 seed + 相同固定布置/步进 → JSON.stringify(snapshot().projectiles) 字节级相等。
 *
 * 确定性：测试仅做固定 seed（EMBER-S1/biome 0）下的确定性注入与步进，不引入 Date/Math.random。
 *   gunner 仅在 wave≥2 经 dungeon-gen 注入，故测试直接取首个 ENEMY 活引用改写 enemyTypeId 为
 *   gunner_imp（同 bomber-imp.test.ts 将 grunt 搬到玩家身旁的手法）。
 *
 * 运行：node --experimental-strip-types --test tests/unit/gunner-imp.test.ts
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
    runId: "GUNNER-IMP",
    seed: "EMBER-S1", // 与 bomber-imp / brute-charger 同约定
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

/** 把给定敌人活引用改写为 gunner_imp（仅测试用；复用 ENEMY_PROTOTYPES 的平衡初稿字段）。 */
function makeGunner(e: Actor): void {
  e.enemyTypeId = "gunner_imp";
  const proto = ENEMY_PROTOTYPES.gunner_imp;
  e.hp = proto.hpMin;
  e.maxHp = proto.hpMin;
  e.status = EntityStatus.ALIVE;
}

/** 将除 gunner 外的所有敌人搬离地图（隔离弹道伤害归因，排除杂兵干扰）。 */
function exileOtherEnemies(world: ReturnType<typeof createWorld>, gunnerId: number): void {
  for (const a of world.actors()) {
    if (a.kind === EntityKind.ENEMY && a.id !== gunnerId) {
      a.x = 5000;
      a.y = 5000;
      a.telegraph = null;
    }
  }
}

// ============================================================
// (A) 原型数据（③）
// ============================================================

test("(A) gunner_imp prototype sanity", () => {
  assert.ok(ENEMY_PROTOTYPES.gunner_imp, "gunner_imp prototype present");
  assert.equal(
    ENEMY_PROTOTYPES.gunner_imp.shape,
    TelegraphShape.LINE,
    "telegraph shape is LINE (3)",
  );
  assert.ok(
    ENEMY_PROTOTYPES.gunner_imp.attackRange >= 140,
    `attackRange ${ENEMY_PROTOTYPES.gunner_imp.attackRange} >= 140 (kite range)`,
  );
  assert.ok(
    ENEMY_PROTOTYPES.gunner_imp.telegraphTicks >= 16,
    `telegraphTicks ${ENEMY_PROTOTYPES.gunner_imp.telegraphTicks} >= 16 (aim windup)`,
  );
  // speed 介于 grunt_swarm(70) 与 bomber_imp(135) 之间（远程风筝者）。
  const g = ENEMY_PROTOTYPES.gunner_imp.speed;
  assert.ok(
    g > ENEMY_PROTOTYPES.grunt_swarm.speed && g < ENEMY_PROTOTYPES.bomber_imp.speed,
    `speed ${g} between grunt ${ENEMY_PROTOTYPES.grunt_swarm.speed} and bomber ${ENEMY_PROTOTYPES.bomber_imp.speed}`,
  );
  assert.equal(ENEMY_PROTOTYPES.gunner_imp.tier, "grunt", "gunner is a grunt-tier kiter");
});

// ============================================================
// (B) 敌人 AI（⑧）：射程内起 telegraph / 贴脸后撤
// ============================================================

test("(B1) gunner_imp starts a LINE telegraph when a player is within attackRange (not adjacent)", () => {
  const { world, p0, p1, firstEnemy } = mkWorld();
  makeGunner(firstEnemy);
  // 将 gunner 与两名玩家摆在可控位置：p0 在射程内(100px)但非贴脸；p1 远置以固定「最近玩家」为 p0。
  firstEnemy.x = 1024;
  firstEnemy.y = 640;
  p0.x = firstEnemy.x + 100; // 在 attackRange(160) 内，且 > retreatThreshold(88)
  p0.y = firstEnemy.y;
  p1.x = firstEnemy.x + 400;
  p1.y = firstEnemy.y;

  world.step(); // 下一 step：AI 产出 ATTACK → world 经 ⑦ 启动 LINE telegraph。
  world.step();
  world.step();

  const after = world.actors().find((a) => a.id === firstEnemy.id)!;
  assert.ok(after.telegraph != null, "gunner started a telegraph within a few steps");
  const snap = world.snapshot().entities.find((e) => e.id === firstEnemy.id);
  assert.ok(snap?.telegraph != null, "telegraph present in snapshot");
  assert.equal(snap!.telegraph!.shape, TelegraphShape.LINE, "snapshot telegraph shape = LINE");
});

test("(B2) gunner_imp retreats when a player is adjacent (kite)", () => {
  const { world, p0, p1, firstEnemy } = mkWorld();
  makeGunner(firstEnemy);
  firstEnemy.x = 1024;
  firstEnemy.y = 640;
  p0.x = firstEnemy.x + 6; // 贴脸（远 < retreatThreshold 88）
  p0.y = firstEnemy.y;
  p1.x = firstEnemy.x + 400; // 远置，固定最近玩家为 p0
  p1.y = firstEnemy.y;

  const dist0 = Math.hypot(p0.x - firstEnemy.x, p0.y - firstEnemy.y);
  for (let i = 0; i < 4; i++) world.step(); // 贴脸 → 后撤拉开

  const gunnerAfter = world.actors().find((a) => a.id === firstEnemy.id)!;
  const p0After = world.actors().find((a) => a.id === p0.id)!;
  const dist1 = Math.hypot(p0After.x - gunnerAfter.x, p0After.y - gunnerAfter.y);
  assert.ok(dist1 > dist0, `gunner moved AWAY from adjacent player (${dist0.toFixed(1)} -> ${dist1.toFixed(1)})`);
});

// ============================================================
// (C) 弹道生命周期（world.step）：生成 → 位移/命中 → 过期移除
// ============================================================

test("(C) gunner_imp projectile lifecycle: spawn → move+hit → expire-remove", () => {
  const { world, p0, p1, firstEnemy } = mkWorld();
  makeGunner(firstEnemy);
  exileOtherEnemies(world, firstEnemy.id); // 隔离：排除杂兵对 p0 的干扰伤害

  firstEnemy.x = 1024;
  firstEnemy.y = 640;
  p0.x = firstEnemy.x + 100; // 射程内、弹道正前方；p0 静止 → 必被命中
  p0.y = firstEnemy.y;
  p1.x = 5000; // 远置 p1：固定「最近玩家」为 p0，避免 gunner 因 p1 更近而转向后撤
  p1.y = 5000;

  const p0hp0 = p0.hp;

  // 推进至 telegraph applyTick（telegraphTicks=16）→ 本 tick 生成飞行弹道并步进一次。
  for (let i = 0; i < 18; i++) world.step();
  const proj0 = world.projectiles();
  assert.ok(proj0.length >= 1, "at least one projectile spawned after applyTick");
  const observedId = proj0[0].id;
  const sx = proj0[0].x;
  const sy = proj0[0].y;

  // 步进 3 tick：弹道应位移（x/y 改变）且仍存活（尚未命中，碰撞半径 9+14=23px）。
  for (let i = 0; i < 3; i++) world.step();
  const proj1 = world.projectiles().find((p) => p.id === observedId);
  assert.ok(proj1 != null, "observed projectile still alive shortly after spawn");
  assert.ok(
    proj1!.x !== sx || proj1!.y !== sy,
    `projectile moved (${sx.toFixed(1)},${sy.toFixed(1)} -> ${proj1!.x.toFixed(1)},${proj1!.y.toFixed(1)})`,
  );

  // 再步进数 tick：弹道命中路径上 p0 → 经 ⑦ resolveDamage 扣血（纪律 B）。
  for (let i = 0; i < 5; i++) world.step();
  assert.ok(p0.hp < p0hp0, `player in projectile path took damage (hp ${p0hp0} -> ${p0.hp})`);

  // 越过 expireTick（spawnTick+70）：该弹道应被移除（其他后续弹道可能存活，但 observedId 必不见）。
  for (let i = 0; i < 80; i++) world.step();
  const stillThere = world.projectiles().some((p) => p.id === observedId);
  assert.equal(stillThere, false, "observed projectile removed after expireTick");
});

// ============================================================
// (D) 确定性：同 seed + 相同固定布置/步进 → 弹道快照字节级相等
// ============================================================

function driveProjectilesSnapshot(): string {
  const { world, p0, firstEnemy } = mkWorld();
  makeGunner(firstEnemy);
  exileOtherEnemies(world, firstEnemy.id);
  firstEnemy.x = 1024;
  firstEnemy.y = 640;
  p0.x = firstEnemy.x + 100;
  p0.y = firstEnemy.y;
  for (let i = 0; i < 30; i++) world.step();
  return JSON.stringify(world.snapshot().projectiles);
}

test("(D) gunner_imp determinism: identical seed + setup → byte-identical projectile snapshot", () => {
  const a = driveProjectilesSnapshot();
  const b = driveProjectilesSnapshot();
  assert.equal(a, b, "projectile snapshot must be byte-identical across runs");
});
