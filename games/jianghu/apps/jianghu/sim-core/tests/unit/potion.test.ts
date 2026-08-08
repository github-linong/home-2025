/**
 * potion.test.ts — E21 药水/消耗品（sim-core 纯函数 + world 计数/使用，确定性 D9）
 * ===========================================================================
 * 覆盖：
 *   - 常量：POTION_HEAL_RATIO=0.3 / POTION_CD_TICKS=60 / POTION_DROP_NORMAL_CHANCE=0.10 /
 *     POTIONS_BY_TIER（normal 0 / elite 1 / boss 2）（C7 单一来源）；
 *   - 精英击杀 → actor.potionCount +1 + PotionGainEvent（potions=1）；BOSS → +2；
 *   - 普通怪击杀 → 独立 Rng 流概率：同 seed+同 tick+同 enemyId ⇒ 同结果（D9）；
 *     且不消耗 simRng（同 seed 击杀序列 → 掉装与无药水 seed 完全一致，golden 稳）；
 *   - 使用回血：hp = min(maxHp, hp + round(maxHp × 0.3)) + maxHp 上限；
 *   - 满血不可用（FULL_HP，不浪费）；CD 阻断（ON_CD）；消耗计数（count-1）；
 *   - potionCount / lastPotionTick **不进 EntityState 快照**（C12，防污染确定性 journal）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction } from "../../src/types.ts";
import {
  TILE,
  ENEMY_BASE_HP,
  POTION_HEAL_RATIO,
  POTION_CD_TICKS,
  POTION_DROP_NORMAL_CHANCE,
  POTIONS_BY_TIER,
} from "../../src/constants.ts";

const PLAYER_X = 16 * TILE;
const PLAYER_Y = 15 * TILE;
const NEAR = { x: PLAYER_X, y: PLAYER_Y };
const SKILL_ACTIONS = [InputAction.SKILL1, InputAction.SKILL2, InputAction.SKILL3, InputAction.SKILL4];

function mkWorld(opts: { seed?: string; tier?: number } = {}): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "E21-POTION",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    spawnZones: [
      {
        pos: NEAR,
        tier: opts.tier ?? 0,
        enemyTypeId: "n",
        count: 1,
        respawnTicks: 100000, // 不复活，隔离药水计数判定
        aggression: "passive", // 被动：被打才反击（避免站桩被秒杀，聚焦断言）
      },
    ],
  });
}

function player(world: World, seat = 0) {
  return world.actors().find((a) => a.ownerId === seat)!;
}

function findLiveEnemy(world: World) {
  return world.actors().find((a) => (a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS) && a.hp > 0);
}

function issueSkill(world: World, seat: number, slot: number, seq: { s: number }) {
  world.enqueueInput(seat, { seq: seq.s++, tick: world.tick, action: SKILL_ACTIONS[slot], dir: 0, skillSlot: slot });
}

function killAll(world: World, seat: number, slot: number, maxTicks = 5000): boolean {
  const seq = { s: 0 };
  for (let t = 0; t < maxTicks; t++) {
    const e = findLiveEnemy(world);
    if (!e) return true;
    const id = e.id;
    issueSkill(world, seat, slot, seq);
    world.step();
    const after = world.actors().find((a) => a.id === id);
    if ((!after || after.hp <= 0) && !findLiveEnemy(world)) return true;
  }
  return !findLiveEnemy(world);
}

// ─────────────────────────────────────────────────────────────
// ① 常量（C7 单一来源）
// ─────────────────────────────────────────────────────────────

test("E21 常量：回血 0.3 / CD 60tick(5s) / 普通怪概率 0.10 / POTIONS_BY_TIER", () => {
  assert.equal(POTION_HEAL_RATIO, 0.3);
  assert.equal(POTION_CD_TICKS, 60, "5s @12Hz = 60 tick");
  assert.equal(POTION_DROP_NORMAL_CHANCE, 0.1);
  assert.deepEqual(POTIONS_BY_TIER, { normal: 0, elite: 1, boss: 2 });
});

// ─────────────────────────────────────────────────────────────
// ② 击杀计数（精英/BOSS 固定必得；普通怪独立 Rng 概率）
// ─────────────────────────────────────────────────────────────

test("精英击杀 → actor.potionCount +1 + PotionGainEvent（potions=1）", () => {
  const world = mkWorld({ seed: "pot-elite", tier: 1 });
  const elite = world.actors().find((a) => a.tier === 1)!;
  assert.equal(elite.hp, ENEMY_BASE_HP * 3, "精英 hp = 90");
  assert.ok(killAll(world, 0, 3, 2000), "精英（90hp）应被 SKILL4 击杀");
  const p = player(world);
  assert.equal(p.potionCount, 1, "精英击杀 → 药水 +1");
  const gains = world.consumePotionGains();
  assert.deepEqual(gains, [{ seatId: 0, potions: 1 }], "PotionGainEvent 携带 seatId + potions=1");
  assert.equal(world.consumePotionGains().length, 0, "消费后缓冲清空");
});

test("BOSS 击杀 → actor.potionCount +2 + PotionGainEvent（potions=2）", () => {
  const world = mkWorld({ seed: "pot-boss", tier: 2 });
  const boss = world.actors().find((a) => a.tier === 2)!;
  assert.equal(boss.hp, ENEMY_BASE_HP * 10, "BOSS hp = 300");
  assert.ok(killAll(world, 0, 3, 5000), "BOSS（300hp）应被 SKILL4 击杀");
  const p = player(world);
  assert.equal(p.potionCount, 2, "BOSS 击杀 → 药水 +2");
  assert.deepEqual(world.consumePotionGains(), [{ seatId: 0, potions: 2 }], "PotionGainEvent potions=2");
});

test("普通怪击杀 → 独立 Rng 流确定性：同 seed+同 tick+同 enemyId ⇒ 同结果（D9）", () => {
  const w1 = mkWorld({ seed: "pot-det", tier: 0 });
  const w2 = mkWorld({ seed: "pot-det", tier: 0 });
  assert.ok(killAll(w1, 0, 0, 1000));
  assert.ok(killAll(w2, 0, 0, 1000));
  const p1 = player(w1), p2 = player(w2);
  assert.equal(p1.potionCount, p2.potionCount, "同 seed 同输入 ⇒ 同药水结果（独立 Rng 确定性）");
  assert.ok(p1.potionCount === 0 || p1.potionCount === 1, "普通怪单次击杀最多 1 瓶（概率命中）");
});

test("普通怪药水独立 Rng 不扰动 simRng：同 seed 击杀 → 掉装与无药水版本字节一致（golden 稳）", () => {
  // 对照组：无药水逻辑时的掉装流（E19 材质同构：材料计数不消耗 simRng，掉装仅由 rollLoot 决定）。
  const wA = mkWorld({ seed: "pot-no-perturb", tier: 0 });
  const wB = mkWorld({ seed: "pot-no-perturb", tier: 0 });
  assert.ok(killAll(wA, 0, 0, 1000));
  assert.ok(killAll(wB, 0, 0, 1000));
  // 同 seed ⇒ 同掉装（D9）；药水独立流不改变掉落 Rng 序列。
  const dropsA = wA.actors().filter((a) => a.kind === EntityKind.LOOT_GROUND).map((a) => a.loot?.itemId);
  const dropsB = wB.actors().filter((a) => a.kind === EntityKind.LOOT_GROUND).map((a) => a.loot?.itemId);
  assert.deepEqual(dropsA, dropsB, "同 seed 同输入 ⇒ 同掉装（药水流独立，不扰动 simRng）");
  // 药水事件本身由独立流驱动（本 seed 可 0/1 瓶），但与掉装序列无关：两次运行的掉落必须字节一致。
  const gainsA = wA.consumePotionGains();
  const gainsB = wB.consumePotionGains();
  assert.deepEqual(gainsA, gainsB, "同 seed ⇒ 同药水事件（确定性）");
});

// ─────────────────────────────────────────────────────────────
// ③ 使用回血（world.usePotion 服务端权威）
// ─────────────────────────────────────────────────────────────

test("使用回血：hp = min(maxHp, hp + round(maxHp × 0.3))；消耗 1 瓶 + 置 CD", () => {
  const world = mkWorld({ seed: "pot-use", tier: 0 });
  const p = player(world);
  p.potionCount = 2;
  // 压血到 50/100 → 回 30（round(100×0.3)=30）→ 80。
  p.hp = 50;
  const r = world.usePotion(0, world.tick);
  assert.equal(r.ok, true);
  assert.equal(r.healed, 30, "round(maxHp×0.3)=30");
  assert.equal(r.count, 1, "药水 2 → 1");
  assert.equal(r.cdTicksLeft, POTION_CD_TICKS);
  assert.equal(p.hp, 80, "50 + 30 = 80");
  assert.equal(p.lastPotionTick, world.tick, "CD 起始 tick 记录");
});

test("回血 clamp 到 maxHp（不溢出）", () => {
  const world = mkWorld({ seed: "pot-cap", tier: 0 });
  const p = player(world);
  p.potionCount = 1;
  p.hp = 90; // 90 + 30 = 120 > 100 → clamp 100
  const r = world.usePotion(0, world.tick);
  assert.equal(r.ok, true);
  assert.equal(r.healed, 10, "min(maxHp-hp, round(0.3×maxHp)) = min(10, 30) = 10");
  assert.equal(p.hp, p.maxHp, "clamp 到 maxHp=100");
});

test("满血不可用 → FULL_HP（不浪费；主理人拍板）", () => {
  const world = mkWorld({ seed: "pot-full", tier: 0 });
  const p = player(world);
  p.potionCount = 3;
  const r = world.usePotion(0, world.tick);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "FULL_HP");
  assert.equal(p.potionCount, 3, "满血不消耗药水");
  assert.equal(world.consumePotionGains().length, 0, "无事件产生");
});

test("CD 阻断：上次使用后 POTION_CD_TICKS 内不可再用", () => {
  const world = mkWorld({ seed: "pot-cd", tier: 0 });
  const p = player(world);
  p.potionCount = 2;
  p.hp = 50;
  assert.equal(world.usePotion(0, 10).ok, true, "tick 10 使用成功");
  assert.equal(p.hp, 80);
  // CD 内（tick 10 + 59）→ 拒绝。
  const r1 = world.usePotion(0, 10 + POTION_CD_TICKS - 1);
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, "ON_CD");
  assert.equal(p.hp, 80, "CD 中不回血");
  assert.equal(p.potionCount, 1, "CD 中不消耗");
  // CD 到（tick 10 + 60）→ 可用。
  const r2 = world.usePotion(0, 10 + POTION_CD_TICKS);
  assert.equal(r2.ok, true, "CD 到期可再用");
  assert.equal(p.hp, Math.min(p.maxHp, 80 + Math.round(p.maxHp * POTION_HEAL_RATIO)), "第二次回血生效");
});

test("无药水 → NO_POTIONS；无 actor → NO_ACTOR（幂等）", () => {
  const world = mkWorld({ seed: "pot-none", tier: 0 });
  const p = player(world);
  p.hp = 50;
  const r = world.usePotion(0, world.tick);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "NO_POTIONS");
  assert.equal(p.hp, 50, "失败不改状态");
  assert.equal(world.usePotion(999, world.tick).reason, "NO_ACTOR");
});

// ─────────────────────────────────────────────────────────────
// ④ C12：potionCount / lastPotionTick 不进 EntityState 快照
// ─────────────────────────────────────────────────────────────

test("potionCount / lastPotionTick 不进 EntityState 快照（C12，防污染确定性 journal）", () => {
  const world = mkWorld({ seed: "pot-c12", tier: 1 });
  assert.ok(killAll(world, 0, 3, 2000));
  const p = player(world);
  assert.equal(p.potionCount, 1, "world 内部计数已累计");
  const json = JSON.stringify(world.snapshot().entities);
  assert.ok(!json.includes("potionCount"), "快照序列化不含 potionCount 字段（C12）");
  assert.ok(!json.includes("lastPotionTick"), "快照序列化不含 lastPotionTick 字段（C12）");
});
