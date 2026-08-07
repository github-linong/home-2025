/**
 * enemy-ai.test.ts — E6 敌人 AI 状态机（敌人类别 + 仇恨 + 追击 + 接触攻击 + 被动反击 + 确定性）
 * ===========================================================================
 * 覆盖（全部确定性断言，D9：无随机、无 Date.now）：
 *   ① passive（普通怪 tier 0 默认）不追不攻：玩家进入接触内，敌人静止、玩家不掉血；
 *   ② aggressive（精英 tier 1 默认）仇恨半径内 CHASE 追击（坐标向玩家靠近）、半径外 IDLE（不动）；
 *   ③ 接触攻击触发：aggressive 敌人在接触内按 ENEMY_ATTACK_INTERVAL_TICKS 周期扣玩家 hp；
 *   ④ 被动怪被打后反击（被打才反击）：SKILL 命中被动怪 → 同 tick 接触内反击；未被打不攻击；
 *   ⑤ 确定性：同 seed + 同输入序列 ⇒ 同敌人坐标序列（D9）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction } from "../../src/types.ts";
import {
  TILE,
  ENEMY_BASE_HP,
  ENEMY_BASE_ATK,
  ENEMY_ATTACK_INTERVAL_TICKS,
  ENEMY_MOVE_SPEED,
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
    seed: opts.seed ?? "AI",
    phase: RoomPhase.OVERWORLD,
    spawnZones: opts.spawnZones,
    lootTokens: 0, // 无环境掉落，隔离 AI 断言
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

/** 生成一个 tier 敌人并让玩家与其重叠/接触（敌人在刷怪点 ±TILE 散布，取实际 pos）。 */
function worldWithContactEnemy(opts: { seed: string; tier: 0 | 1 | 2; aggression?: "passive" | "aggressive"; offset?: number }): {
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
  world.addPlayer(1, "u1", { x: enemy.x + (opts.offset ?? 0), y: enemy.y });
  return { world, enemy, player: findPlayer(world) };
}

// ─────────────────────────────────────────────────────────────
// ① passive：不追不攻（IDLE 完全静止）
// ─────────────────────────────────────────────────────────────

test("① passive 怪：玩家进入接触内不主动攻击、不追击（完全静止）", () => {
  const { world, enemy, player } = worldWithContactEnemy({ seed: "ai-passive", tier: 0 });
  const ex = enemy.x;
  const ey = enemy.y;
  for (let i = 0; i < 20; i++) world.step();
  const e2 = world.actors().find((a) => a.id === enemy.id)!;
  const p2 = world.actors().find((a) => a.id === player.id)!;
  assert.equal(e2.x, ex, "passive 敌人不追击（x 不变）");
  assert.equal(e2.y, ey, "passive 敌人不追击（y 不变）");
  assert.equal(p2.hp, 100, "passive 敌人不主动攻击（玩家无伤害）");
});

// ─────────────────────────────────────────────────────────────
// ② aggressive：仇恨半径内 CHASE 追击 / 半径外 IDLE
// ─────────────────────────────────────────────────────────────

test("② aggressive 怪：仇恨半径内 CHASE 追击（坐标向玩家靠近），半径外 IDLE（不动）", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({ seed: "ai-chase", spawnZones: [{ pos: P, tier: 1, enemyTypeId: "e", count: 1 }] });
  const enemy = findEnemy(world);
  // 玩家在敌人东侧 120px：在仇恨半径（240px）内、接触范围（48px）外。
  world.addPlayer(1, "u1", { x: enemy.x + 120, y: enemy.y });
  const x0 = enemy.x;
  const y0 = enemy.y;

  for (let i = 0; i < 5; i++) world.step();
  const e1 = world.actors().find((a) => a.id === enemy.id)!;
  const expectedMove = 5 * ENEMY_MOVE_SPEED * TILE; // 5 tick × 8px = 40px
  assert.ok(Math.abs(e1.x - x0 - expectedMove) < 1e-6, `CHASE 向玩家靠近：Δx=${(e1.x - x0).toFixed(2)} ≈ ${expectedMove.toFixed(2)}`);
  assert.equal(e1.y, y0, "同 y 轴（玩家仅偏东）追击不偏航");

  // 玩家移出仇恨半径（>240px）→ aggressive 敌人停止追击（IDLE）。
  const far = e1.x + AGGRO_RADIUS + 100;
  world.removePlayer(1);
  world.addPlayer(1, "u1", { x: far, y: e1.y });
  for (let i = 0; i < 5; i++) world.step();
  const e2 = world.actors().find((a) => a.id === enemy.id)!;
  assert.equal(e2.x, e1.x, "半径外 → IDLE（不追击，x 不变）");
  assert.equal(e2.y, e1.y, "半径外 → IDLE（y 不变）");
});

// ─────────────────────────────────────────────────────────────
// ③ 接触攻击触发（aggressive 敌人在接触内按周期扣血）
// ─────────────────────────────────────────────────────────────

test("③ aggressive 接触攻击：接触内按 ENEMY_ATTACK_INTERVAL_TICKS 周期扣玩家 hp", () => {
  const { world, enemy, player } = worldWithContactEnemy({ seed: "ai-attack", tier: 1 }); // 精英 atk=8*3=24
  const p0 = player.hp;
  world.step(); // t=0 首次接触攻击（lastAttackTick 初始化为 -interval → 立即命中）
  const p1 = world.actors().find((a) => a.id === player.id)!;
  assert.equal(p1.hp, p0 - ENEMY_BASE_ATK * 3, "t=0 接触攻击：100-24=76");
  // 再走 ENEMY_ATTACK_INTERVAL_TICKS tick → t=12 第二次攻击。
  for (let i = 0; i < ENEMY_ATTACK_INTERVAL_TICKS; i++) world.step();
  const p2 = world.actors().find((a) => a.id === player.id)!;
  assert.equal(p2.hp, p0 - 2 * ENEMY_BASE_ATK * 3, "t=12 第二次攻击：100-48=52");
});

// ─────────────────────────────────────────────────────────────
// ④ 被动怪被打后反击（被打才反击）
// ─────────────────────────────────────────────────────────────

test("④ passive 怪被打后反击：SKILL 命中 → 同 tick 接触内反击；未被打不攻击", () => {
  const { world, enemy, player } = worldWithContactEnemy({ seed: "ai-provoke", tier: 0 });
  // 未被打：玩家与其重叠也不掉血（被动不主动攻击）。
  world.step();
  const pA = world.actors().find((a) => a.id === player.id)!;
  assert.equal(pA.hp, 100, "未被打 → passive 不攻击");
  // 玩家 SKILL 命中（slot0 dmg20）→ 被动怪被打 → 同 tick 接触内反击（atk=8）。
  const seq = { s: 0 };
  issueSkill(world, 1, 0, seq);
  world.step();
  const e2 = world.actors().find((a) => a.id === enemy.id)!;
  const p2 = world.actors().find((a) => a.id === player.id)!;
  assert.equal(e2.hp, ENEMY_BASE_HP - 20, "SKILL 命中：30-20=10");
  assert.equal(p2.hp, 100 - ENEMY_BASE_ATK, "被打后反击：100-8=92");
});

// ─────────────────────────────────────────────────────────────
// ⑤ 确定性：同 seed + 同输入序列 ⇒ 同敌人坐标序列
// ─────────────────────────────────────────────────────────────

test("⑤ 确定性：同 seed + 同输入序列 ⇒ 同敌人坐标序列（D9）", () => {
  const run = (): number[] => {
    const P = { x: 20 * TILE, y: 15 * TILE };
    const world = mkWorld({ seed: "ai-det", spawnZones: [{ pos: P, tier: 1, enemyTypeId: "e", count: 1 }] });
    const enemy = findEnemy(world);
    world.addPlayer(1, "u1", { x: enemy.x + 120, y: enemy.y });
    const xs: number[] = [];
    for (let i = 0; i < 20; i++) {
      world.step();
      const e = world.actors().find((a) => a.id === enemy.id)!;
      xs.push(Math.round(e.x * 1000) / 1000);
    }
    return xs;
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "同 seed + 同输入 → 敌人坐标序列字节级一致");
});
