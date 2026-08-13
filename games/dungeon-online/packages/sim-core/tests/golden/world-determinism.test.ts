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
// wave-progression 重锁说明：world.createWorld 改为「初始只生 wave 1」（原一次性生全部 wave），
//   固定序列下 snapshot().entities 仅含 wave-1 实体 → 实体集改变 → 哈希改变；确定性未破坏
//   （三次运行字节相等）。新增的 wave/totalWaves/intermissionTicks/enemiesRemaining 为快照顶层字段，
//   不参与 entities 哈希，故不影响本锚点；仅实体集变化导致重锁。
// BAL-FIX 2026-08-11 重锁说明：玩家普攻 18→26 / 玩家 HP +40% / 敌人伤害下调 → 固定序列（一次 ATTACK）
//   的敌人 hp 变化（-26 而非 -18）→ 世界快照哈希改变；确定性未破坏（三次运行字节相等），故重锁本值。
// DIST-FIX 2026-08-11 重锁说明：① wave1 刷怪点锚定到玩家出生点附近（150-300px 环带）→ 实体初始坐标改变；
//   ② 玩家普攻加射程校验（PLAYER_ATTACK_RANGE=60px）→ 固定序列改为「先靠近 25 tick 再 ATTACK」→
//   实体坐标/状态序列改变 → 世界快照哈希改变；确定性未破坏（三次运行字节相等），故重锁本值。
// G1-FIX 2026-08-11 重锁说明：玩家实体新增 level:1/xp:0 快照字段（升级系统）→ 快照序列化多出 level/xp 键 →
//   哈希改变；确定性未破坏（同 seed+inputs 三次运行字节相等），故重锁本值。
// SLAUGHTER-FIX 2026-08-12 重锁：玩家普攻 38 + SPAWN 6-10 + 波次 2-4 → wave1 实体集/坐标/攻击结算变化
//   → 世界快照哈希改变；确定性未破坏（三次运行字节相等），故重锁本值。
// RANGE-BALANCE 2026-08-12 重锁：玩家近战 90→130px + 前向扇形 AOE（±60°）+ 远程怪射程下调
//   （caster 175→120 / gunner 160→110）→ 固定序列攻击结算/实体坐标变化 → 世界快照哈希改变；
//   确定性未破坏（三次运行字节相等），故重锁本值。
const GOLDEN_WORLD_HASH =
  "4c1fa849fa6b10c7d5d61a7c501e13e00f370af994aae9bb831549a695230011";

function hashEntities(entities: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(entities)).digest("hex");
}

/** 固定输入序列：P1 靠近首个敌人后发起一次 ATTACK（前摇 18 tick，D12），随后 P1/P2 各做 25 tick 占位移动。
 * DIST-FIX 2026-08-11：玩家出生距 wave1 敌人 150-300px（>普攻射程 60px）→ 序列先移动接近敌人，
 *   再 ATTACK（否则 ATTACK 因射程校验 no-op，攻击不落地）。
 * SLAUGHTER-FIX：grunt 18-30HP，38 伤害一刀即死 → enemy 可能被移除（enemyHp/enemyStatus 可 undefined）。 */
function runFixedSequence(): { hash: string; enemyHp?: number; enemyMax: number; enemyStatus?: number; enemyAlive: boolean } {
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

  // Phase 1（tick 0..24）：P1 朝首个敌人移动接近（MOVE，方向 = 指向敌人）；P2 占位移动。
  // 25 tick × ~7px/tick ≈ 175px 位移，足以把 150-300px 初始距离压到普攻射程 60px 内。
  for (let i = 0; i < 25; i++) {
    const me = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0)!;
    const tgt = world.actors().find((a) => a.id === enemyId)!;
    const dx = tgt.x - me.x;
    const dy = tgt.y - me.y;
    const len = Math.hypot(dx, dy) || 1;
    world.enqueueInput(0, { seq: 1 + i, tick: i, action: InputAction.MOVE, dir: { x: dx / len, y: dy / len } });
    world.enqueueInput(1, { seq: 1 + i, tick: i, action: InputAction.MOVE, dir: { x: 0, y: 1 } });
    world.step();
  }
  // Phase 2（tick 25）：P1 发起 ATTACK（target = 首个敌人），前摇 18 tick（D12）。
  world.enqueueInput(0, { seq: 26, tick: 25, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: enemyId });
  world.step();
  // Phase 3：后续固定移动序列（含占位 AI 推进）；攻击在 tick>=43 经 ⑦ 结算。
  for (let i = 0; i < 25; i++) {
    world.enqueueInput(0, { seq: 27 + i, tick: 26 + i, action: InputAction.MOVE, dir: { x: 1, y: 0 } });
    world.enqueueInput(1, { seq: 27 + i, tick: 26 + i, action: InputAction.MOVE, dir: { x: 0, y: 1 } });
    world.step();
  }

  const enemy = world.actors().find((a) => a.id === enemyId);
  return {
    hash: hashEntities(world.snapshot().entities),
    // SLAUGHTER-FIX：grunt 18-30HP，玩家 38 伤害一刀即死 → enemy 可能已被移除（undefined）。
    enemyHp: enemy ? enemy.hp : undefined,
    enemyMax,
    enemyStatus: enemy ? enemy.status : undefined,
    enemyAlive: enemy ? (enemy.status & EntityStatus.ALIVE) !== 0 : false,
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

test("E5 world golden: the locked attack actually applied (damage landed)", () => {
  // SLAUGHTER-FIX：grunt 血 18-30，玩家 38 伤害一刀即死 → enemy 可能已 DOWNED 或被移除。
  // 断言改为「攻击确实造成伤害或击杀」。
  const { enemyHp, enemyMax, enemyAlive } = runFixedSequence();
  assert.ok(
    enemyHp === undefined || enemyHp < enemyMax || !enemyAlive,
    `attack must reduce hp or kill (alive=${enemyAlive}, hp=${enemyHp}/${enemyMax})`,
  );
});
