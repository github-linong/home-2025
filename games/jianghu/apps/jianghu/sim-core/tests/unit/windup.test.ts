/**
 * windup.test.ts — E18 敌人攻击前摇（windup）：可读可躲、落刀判定、间隔语义、确定性
 * ===========================================================================
 * 覆盖（全部确定性断言，D9：无随机、无 Date.now）：
 *   ① 攻击前 WINDUP 状态：status 位（快照可见，客户端画抬手）+ 内部 windupUntilTick；
 *   ② 前摇期间玩家走开 → 落空（无伤害，可躲）；
 *   ③ 落刀时目标仍在接触范围 → 伤害结算 + 清 WINDUP（status 位 + 内部字段复位）；
 *   ④ 前摇期间敌人不移动（站立蓄力；玩家走出接触后仍在仇恨内也不追击）；
 *   ⑤ 确定性：同 seed + 同输入 → 同 hp/status 序列（D9）；
 *   ⑥ 附加：passive 被打后反击同样走前摇；BOSS phase2 周期（前摇 5 + 后摇 1）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, EntityStatus, RoomPhase, InputAction } from "../../src/types.ts";
import {
  TILE,
  ENEMY_BASE_HP,
  ENEMY_BASE_ATK,
  ENEMY_WINDUP_TICKS,
  BOSS_PHASE2_ATTACK_INTERVAL_TICKS,
  AGGRO_RADIUS,
} from "../../src/constants.ts";

const SKILL_ACTIONS = [InputAction.SKILL1, InputAction.SKILL2, InputAction.SKILL3, InputAction.SKILL4];

interface TestZone {
  pos: { x: number; y: number };
  tier: 0 | 1 | 2;
  enemyTypeId: string;
  count: number;
  aggression?: "passive" | "aggressive";
}

function mkWorld(opts: { seed?: string; spawnZones?: TestZone[] }): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "WINDUP",
    phase: RoomPhase.OVERWORLD,
    spawnZones: opts.spawnZones,
    lootTokens: 0, // 无环境掉落，隔离断言
  });
}

function issueSkill(world: World, seat: number, slot: number, seq: { s: number }): void {
  world.enqueueInput(seat, {
    seq: seq.s++,
    tick: world.tick,
    action: SKILL_ACTIONS[slot],
    dir: 0,
    skillSlot: slot,
  });
}

function findEnemy(world: World, kind = EntityKind.ENEMY) {
  return world.actors().find((a) => a.kind === kind)!;
}

function findPlayer(world: World, seat = 1) {
  return world.actors().find((a) => a.ownerId === seat)!;
}

/** 生成 tier 敌人并让玩家与其接触（敌人在刷怪点 ±TILE 散布，取实际 pos）。 */
function worldWithContactEnemy(opts: { seed: string; tier: 0 | 1 | 2; aggression?: "passive" | "aggressive" }): {
  world: World;
  enemy: ReturnType<typeof findEnemy>;
  player: ReturnType<typeof findPlayer>;
} {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({
    seed: opts.seed,
    spawnZones: [{ pos: P, tier: opts.tier, enemyTypeId: "e", count: 1, aggression: opts.aggression }],
  });
  const enemy = findEnemy(world);
  world.addPlayer(1, "u1", { x: enemy.x, y: enemy.y }); // 玩家与敌人重叠 → 接触内
  return { world, enemy, player: findPlayer(world) };
}

// ─────────────────────────────────────────────────────────────
// ① 攻击前 WINDUP 状态（status 位 + windupUntilTick + 快照下发）
// ─────────────────────────────────────────────────────────────

test("① 攻击前 WINDUP 状态：status 位（快照可见）+ 内部 windupUntilTick", () => {
  const { world, enemy, player } = worldWithContactEnemy({ seed: "windup-state", tier: 1 });
  world.step(); // t=0 敌人进入前摇（决策 tick）
  const e1 = world.actors().find((a) => a.id === enemy.id)!;
  assert.ok((e1.status & EntityStatus.WINDUP) !== 0, "敌人 status 应含 WINDUP 位");
  assert.equal(e1.windupUntilTick, 0 + ENEMY_WINDUP_TICKS, "windupUntilTick = t + ENEMY_WINDUP_TICKS");
  assert.equal(e1.windupTargetId, player.id, "前摇锁定目标 = 接触内玩家");
  // 快照下发：客户端可读 WINDUP 位（C12：status bitmask 序列化）→ 画抬手。
  const snap = world.snapshot();
  const es = snap.entities.find((s) => s.id === enemy.id)!;
  assert.ok((es.status & EntityStatus.WINDUP) !== 0, "快照 status 应含 WINDUP 位（客户端画抬手）");
  // 目标不动 → 落刀后清 WINDUP + 内部字段。
  for (let i = 0; i < ENEMY_WINDUP_TICKS; i++) world.step(); // t=1..5 → t=5 落刀
  const e2 = world.actors().find((a) => a.id === enemy.id)!;
  assert.ok((e2.status & EntityStatus.WINDUP) === 0, "落刀后应清 WINDUP 位");
  assert.equal(e2.windupUntilTick, undefined, "落刀后 windupUntilTick 应复位");
  assert.equal(e2.windupTargetId, undefined, "落刀后 windupTargetId 应复位");
});

// ─────────────────────────────────────────────────────────────
// ② 前摇期间玩家走开 → 落空（无伤害）
// ─────────────────────────────────────────────────────────────

test("② 前摇期间玩家走开 → 落空（无伤害，可躲）", () => {
  const { world, enemy, player } = worldWithContactEnemy({ seed: "windup-dodge", tier: 1 }); // 精英 atk=24
  world.step(); // t=0 敌人进入前摇
  // 玩家前摇期间向东走开（MOVE dir=0，+16px/tick）：t=4 距 64px（接触 48 外、仇恨 240 内）。
  const seq = { s: 0 };
  for (let i = 0; i < ENEMY_WINDUP_TICKS - 1; i++) {
    world.enqueueInput(1, { seq: seq.s++, tick: world.tick, action: InputAction.MOVE, dir: 0 });
    world.step(); // t=1..4
  }
  // t=5 落刀：玩家已走出接触范围（最后 tick 无输入，lastMove 续行 +16px → 距 80px）→ 落空。
  world.step();
  const p = findPlayer(world);
  assert.equal(p.hp, 100, "玩家前摇期间走开 → 落刀落空（无伤害）");
  const e = world.actors().find((a) => a.id === enemy.id)!;
  assert.ok((e.status & EntityStatus.WINDUP) === 0, "落空后同样清 WINDUP 位（不卡状态）");
});

// ─────────────────────────────────────────────────────────────
// ③ 落刀时目标仍在接触范围 → 伤害结算 + 清 WINDUP
// ─────────────────────────────────────────────────────────────

test("③ 落刀时目标仍在接触范围 → 伤害结算 + 清 WINDUP", () => {
  const { world, enemy, player } = worldWithContactEnemy({ seed: "windup-hit", tier: 1 }); // 精英 atk=24
  const p0 = player.hp;
  world.step(); // t=0 进入前摇（WINDUP）
  const e1 = world.actors().find((a) => a.id === enemy.id)!;
  assert.ok((e1.status & EntityStatus.WINDUP) !== 0, "前摇中 WINDUP 位置位");
  for (let i = 0; i < ENEMY_WINDUP_TICKS; i++) world.step(); // t=1..5 → t=5 落刀
  const p = findPlayer(world);
  const e2 = world.actors().find((a) => a.id === enemy.id)!;
  assert.equal(p.hp, p0 - ENEMY_BASE_ATK * 3, "目标仍在接触 → 落刀结算 100-24=76");
  assert.ok((e2.status & EntityStatus.WINDUP) === 0, "落刀后清 WINDUP 位");
  assert.equal(e2.windupUntilTick, undefined, "落刀后 windupUntilTick 复位");
  assert.equal(e2.windupTargetId, undefined, "落刀后 windupTargetId 复位");
});

// ─────────────────────────────────────────────────────────────
// ④ 前摇期间敌人不移动（站立蓄力）
// ─────────────────────────────────────────────────────────────

test("④ 前摇期间敌人不移动（站立蓄力；玩家走出接触后仍在仇恨内也不追击）", () => {
  const { world, enemy, player } = worldWithContactEnemy({ seed: "windup-stand", tier: 1 });
  const ex0 = enemy.x;
  const ey0 = enemy.y;
  world.step(); // t=0 进入前摇
  // 玩家走出接触（MOVE 东移）：仍在仇恨半径（240px）内 —— 无「前摇不移动」规则 aggressive 会追击。
  const seq = { s: 0 };
  for (let i = 0; i < ENEMY_WINDUP_TICKS - 1; i++) {
    world.enqueueInput(1, { seq: seq.s++, tick: world.tick, action: InputAction.MOVE, dir: 0 });
    world.step(); // t=1..4（前摇中）
  }
  const e1 = world.actors().find((a) => a.id === enemy.id)!;
  assert.equal(e1.x, ex0, "前摇期间敌人 x 不移动（站立蓄力）");
  assert.equal(e1.y, ey0, "前摇期间敌人 y 不移动（站立蓄力）");
  assert.ok((e1.status & EntityStatus.WINDUP) !== 0, "仍在蓄力");
  world.step(); // t=5 落刀（玩家走出接触 → 落空）+ 清 WINDUP
  world.step(); // t=6 WINDUP 已清 → 玩家在仇恨内但不在接触 → aggressive 恢复追击
  const e2 = world.actors().find((a) => a.id === enemy.id)!;
  assert.ok((e2.status & EntityStatus.WINDUP) === 0, "落刀后清 WINDUP");
  assert.ok(e2.x > ex0, "前摇结束后恢复追击（x 向玩家靠近）");
  assert.ok(AGGRO_RADIUS > 0, "仇恨半径常量存在（测试前提）");
});

// ─────────────────────────────────────────────────────────────
// ⑤ 确定性（D9）
// ─────────────────────────────────────────────────────────────

test("⑤ 确定性：同 seed + 同输入 → 同 hp/status 序列（D9）", () => {
  const run = (): { hps: number[]; statuses: number[] } => {
    const { world, enemy, player } = worldWithContactEnemy({ seed: "windup-det", tier: 1 });
    const hps: number[] = [];
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      world.step();
      const p = findPlayer(world);
      const e = findEnemy(world);
      hps.push(p.hp);
      statuses.push(e.status);
    }
    return { hps, statuses };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "同 seed + 同输入 → hp/status 序列字节级一致（含 WINDUP 位时序，D9）");
});

// ─────────────────────────────────────────────────────────────
// ⑥ 附加：passive 反击走前摇 + BOSS phase2 周期
// ─────────────────────────────────────────────────────────────

test("⑥ passive 被打后反击同样走前摇（落刀延后）", () => {
  const { world, enemy, player } = worldWithContactEnemy({ seed: "windup-provoke", tier: 0 });
  const seq = { s: 0 };
  issueSkill(world, 1, 0, seq);
  world.step(); // t=0：SKILL 命中 + 被动怪进入前摇（反击延后到前摇结束）
  const e1 = world.actors().find((a) => a.id === enemy.id)!;
  const p1 = world.actors().find((a) => a.id === player.id)!;
  assert.equal(e1.hp, ENEMY_BASE_HP - 20, "SKILL 命中：30-20=10");
  assert.equal(p1.hp, 100, "反击同 tick 未结算（进入前摇）");
  for (let i = 0; i < ENEMY_WINDUP_TICKS; i++) world.step(); // t=1..5 → t=5 反击落刀
  const p2 = world.actors().find((a) => a.id === player.id)!;
  assert.equal(p2.hp, 100 - ENEMY_BASE_ATK, "前摇结束反击落刀：100-8=92");
});

test("⑥b BOSS phase2 攻击周期 = 前摇 ENEMY_WINDUP_TICKS + 后摇 1（决策间隔 BOSS_PHASE2_ATTACK_INTERVAL_TICKS=6）", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({ seed: "windup-boss", spawnZones: [{ pos: P, tier: 2, enemyTypeId: "b", count: 1 }] });
  const boss = findEnemy(world, EntityKind.BOSS);
  world.addPlayer(1, "u1", { x: boss.x, y: boss.y });
  // 直接置 phase2（确定性；完整跨阈值路径由 world-combat BOSS 阶段测试覆盖）。
  const b = world.actors().find((a) => a.id === boss.id)!;
  b.bossPhase = 1;
  b.hp = b.maxHp * 0.4; // 低血量（phase2 已过，防阶段推进分支干扰）
  // 第一周期：决策 t=0 → 落刀 t=ENEMY_WINDUP_TICKS（BOSS atk=80 → 100-80=20）。
  world.step(); // t=0 决策（进入前摇）
  const p0 = findPlayer(world);
  assert.equal(p0.hp, 100, "phase2 决策 tick 不结算（前摇）");
  for (let i = 0; i < ENEMY_WINDUP_TICKS; i++) world.step(); // t=1..5 → t=5 落刀
  const p1 = findPlayer(world);
  assert.equal(p1.hp, 100 - ENEMY_BASE_ATK * 10, "phase2 第一刀 t=5：100-80=20");
  // 第二周期：决策 t=6（间隔 BOSS_PHASE2_ATTACK_INTERVAL_TICKS=6）→ 落刀 t=11。
  world.step(); // t=6 决策（进入前摇）
  for (let i = 0; i < ENEMY_WINDUP_TICKS; i++) world.step(); // t=7..11 → t=11 落刀
  const p2 = findPlayer(world);
  assert.equal(p2.hp, 0, "phase2 第二刀 t=11：20-80≤0 → 玩家倒地（hp 归零）");
  assert.ok((p2.status & EntityStatus.DOWNED) !== 0, "玩家倒地（DOWNED）");
});
