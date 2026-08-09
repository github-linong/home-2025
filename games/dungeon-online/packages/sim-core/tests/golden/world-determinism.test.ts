/**
 * world-determinism.test.ts — E5 世界状态 golden 测试（C7 / D9 / S5 战斗管线）
 *
 * 在 E5 战斗管线接入后，锁定「同 seed + 同输入序列 → 同世界哈希」的锚点：
 *   对 WorldSnapshot.entities 做 sha256(JSON.stringify(...))，固定输入序列（含一次 ATTACK）
 *   必须跨运行字节级稳定。这是 TS 权威 ↔ GDScript 端口 golden 对齐的第二个锚点（D9）。
 *
 * 与 determinism.test.ts（E3 布局 golden）分离：本文件锁定「世界状态」哈希，
 *   GOLDEN_LAYOUT_HASH 仍由 determinism.test.ts 持有，保持 intact。
 *
 * GOLDEN_WORLD_HASH 由 `node --experimental-strip-types` 跑下方固定序列实测得到，
 *   任何破坏确定性的改动（移动/战斗/AI/前摇）都会让断言失败 → 强制 golden 对齐。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createWorld } from "../../src/world.ts";
import { InputAction, PLAYER_CLASSES, EntityKind, EntityStatus } from "../../src/types.ts";

/** 固定输入序列（含一次 ATTACK）锁定的世界哈希。
 * E6 重锁说明：E6 敌人 AI 接入后敌人移速由占位 1px/tick 改为 ENEMY_PROTOTYPES.speed/30
 * （确定性，无新增随机源），固定序列下敌人坐标变化 → 世界快照哈希改变。同 seed+输入三次
 * 字节相等（确定性 intact），故重锁本值。GOLDEN_LAYOUT_HASH（E3 布局）不受影响。
 * WEB-FEEL 重锁说明：调宽玩家/怪物速度差（玩家 ×1.5、敌人 ×0.63，仅 speed/moveSpeed 字段），
 * 玩家与敌人坐标变化 → 哈希随之改变；确定性未破坏（三次运行字节相等），故再次重锁本值。
 * N2 重锁说明：敌人/玩家移动时更新 Actor.dir（朝向 0-7，vecToDir8 反向映射 DIR_UNIT_VECTORS），
 *   方向性 telegraph（CONE/LINE）的 dir 单位向量随实时移动而变 → 快照哈希改变；确定性未破坏
 *   （三次运行字节相等），故重锁本值。golden 固定序列仅 1 次 ATTACK（18 伤）→ 杂兵存活，
 *   不触发掉落/生怪，故哈希变化仅来自 N2 朝向。
 */
// caster_ember 重锁说明：dungeon-gen 注入 caster_ember 后，固定序列下首只 ENEMY 可能为 caster_ember
//   （hp 40–80 / speed 55 / attackRange 175 / shape LINE），且与玩家相对坐标因 rng 抽流漂移而变 →
//   世界快照哈希改变；确定性未破坏（三次运行字节相等），故重锁本值。
const GOLDEN_WORLD_HASH =
  "22d08984ea50ef625e13e51700dba47bcb60a52e248e68d0b030de486eb131d4";

function hashEntities(entities: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(entities)).digest("hex");
}

/** 固定输入序列：P1 发起一次 ATTACK（前摇 18 tick，D12），随后 P1/P2 各做 25 tick 占位移动。 */
function runFixedSequence(): { hash: string; enemyHp: number; enemyMax: number; enemyStatus: number } {
  const world = createWorld({
    runId: "EMBER-GOLDEN-E5",
    seed: "EMBER-S1",
    biomeId: 0,
    players: [
      { seatId: 0, userId: "P1", classId: PLAYER_CLASSES[0] },
      { seatId: 1, userId: "P2", classId: PLAYER_CLASSES[1] },
    ],
  });
  const enemyId = world.actors().find((a) => a.kind === EntityKind.ENEMY)!.id;
  const enemyMax = world.actors().find((a) => a.id === enemyId)!.maxHp;

  // tick 0：P1 发起 ATTACK（target = 首个敌人），前摇 18 tick（D12）。
  world.enqueueInput(0, { seq: 1, tick: 0, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: enemyId });
  world.step();
  // 后续固定移动序列（含占位 AI 推进）；攻击在 tick>=18 经 ⑦ 结算。
  for (let i = 0; i < 25; i++) {
    world.enqueueInput(0, { seq: 2 + i, tick: 0, action: InputAction.MOVE, dir: { x: 1, y: 0 } });
    world.enqueueInput(1, { seq: 2 + i, tick: 0, action: InputAction.MOVE, dir: { x: 0, y: 1 } });
    world.step();
  }

  const enemy = world.actors().find((a) => a.id === enemyId)!;
  return {
    hash: hashEntities(world.snapshot().entities),
    enemyHp: enemy.hp,
    enemyMax,
    enemyStatus: enemy.status,
  };
}

test("E5 world determinism: same seed + fixed inputs (incl. one attack) → locked hash", () => {
  const h1 = runFixedSequence().hash;
  const h2 = runFixedSequence().hash;
  assert.equal(h1, h2, "deterministic across runs");
  assert.equal(h1, GOLDEN_WORLD_HASH, "matches locked golden world hash");
});

test("E5 world determinism: cross-run byte-equal (repeat N times)", () => {
  const first = runFixedSequence().hash;
  for (let r = 0; r < 5; r++) {
    assert.equal(runFixedSequence().hash, first, `run ${r} must be byte-equal`);
  }
});

test("E5 world golden: the locked attack actually applied (enemy hp < maxHp, still ALIVE)", () => {
  const { enemyHp, enemyMax, enemyStatus } = runFixedSequence();
  assert.ok(enemyHp < enemyMax, "single attack must have reduced enemy hp");
  assert.equal(enemyStatus & EntityStatus.ALIVE, EntityStatus.ALIVE, "enemy still alive (hp>0)");
});
