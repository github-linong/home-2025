/**
 * enchant.test.ts — E19 强化（sim-core 纯函数 + world 材料计数，确定性 D9）
 * ===========================================================================
 * 覆盖：
 *   - computeEquipStats 强化放大公式：词缀 value ×(1 + 0.15×level)（atk / maxHp / reduction）；
 *   - proto baseAtk/baseMaxHp **不**放大（仅词缀放大，E19 拍板）；
 *   - 未强化（enchantLevel 缺省 0）→ 原值（golden 锚点）；
 *   - 精英击杀 → actor.materials +1 + MaterialGainEvent（stones=1）；
 *   - BOSS 击杀 → +2；普通怪击杀 → 无材料事件；
 *   - materials **不进 EntityState 快照**（C12，防污染确定性 journal）；
 *   - 同 seed 同输入 → 同结果（D9）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction } from "../../src/types.ts";
import {
  TILE,
  ENEMY_BASE_HP,
  ENCHANT_AFFIX_MULT_PER_LEVEL,
  MAX_ENCHANT_LEVEL,
} from "../../src/constants.ts";
import { computeEquipStats, type EquippedSlots } from "../../src/affixes.ts";

const PLAYER_X = 16 * TILE;
const PLAYER_Y = 15 * TILE;
const NEAR = { x: PLAYER_X, y: PLAYER_Y };
const SKILL_ACTIONS = [InputAction.SKILL1, InputAction.SKILL2, InputAction.SKILL3, InputAction.SKILL4];

function mkWorld(opts: { seed?: string; tier?: number } = {}): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "E19-ENCHANT",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    spawnZones: [
      {
        pos: NEAR,
        tier: opts.tier ?? 0,
        enemyTypeId: "n",
        count: 1,
        respawnTicks: 100000, // 不复活，隔离材料计数判定
        aggression: "passive", // 被动：被打才反击（避免站桩被 BOSS 秒杀，聚焦断言）
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
// ① 强化放大公式（computeEquipStats，纯函数）
// ─────────────────────────────────────────────────────────────

test("强化公式：词缀 value ×(1 + 0.15×level)（atk 暗金 24 → 58，+1 → 67）", () => {
  // itemId=3 weapon（baseAtk 5）；affix 12（atk 24）darkgold → affixValue = round(24×2.4)=58。
  const base: EquippedSlots = { weapon: { itemId: 3, rarity: 3, affixes: [12] } };
  const s0 = computeEquipStats(base);
  assert.equal(s0.atk, 5 + 58, "未强化 atk = baseAtk(5) + 58 = 63");
  const s1 = computeEquipStats({ weapon: { itemId: 3, rarity: 3, affixes: [12], enchantLevel: 1 } });
  // round(58 × 1.15) = round(66.7) = 67。
  assert.equal(s1.atk, 5 + 67, "+1 atk = baseAtk(5) + round(58×1.15)=67 → 72");
  const s5 = computeEquipStats({ weapon: { itemId: 3, rarity: 3, affixes: [12], enchantLevel: MAX_ENCHANT_LEVEL } });
  // round(58 × (1 + 0.15×5)) = round(58×1.75) = round(101.5) = 102。
  assert.equal(s5.atk, 5 + 102, "+5 atk = baseAtk(5) + round(58×1.75)=102 → 107");
});

test("强化公式：maxHp 词缀放大（暗金 50 → 120，+1 → 138）", () => {
  // itemId=4 armor（baseMaxHp 20）；affix 22（maxHp 50）darkgold → affixValue = round(50×2.4)=120。
  const s0 = computeEquipStats({ armor: { itemId: 4, rarity: 3, affixes: [22] } });
  assert.equal(s0.maxHp, 20 + 120, "未强化 maxHp = base(20) + 120 = 140");
  const s1 = computeEquipStats({ armor: { itemId: 4, rarity: 3, affixes: [22], enchantLevel: 1 } });
  assert.equal(s1.maxHp, 20 + 138, "+1 maxHp = base(20) + round(120×1.15)=138 → 158");
});

test("强化公式：百分点词缀放大后仍归一（reduction 8 暗金 → 19% → +1 → 22%）", () => {
  // itemId=5 trinket；affix 30（reduction 8）darkgold → round(8×2.4)=19 → 0.19。
  const s0 = computeEquipStats({ trinket: { itemId: 5, rarity: 3, affixes: [30] } });
  assert.equal(s0.reduction, 0.19);
  const s1 = computeEquipStats({ trinket: { itemId: 5, rarity: 3, affixes: [30], enchantLevel: 1 } });
  assert.equal(s1.reduction, 0.22, "round(19×1.15)=22 → 22%");
});

test("强化公式：proto base 不放大（无词缀武器 +5 仍 baseAtk）", () => {
  const s0 = computeEquipStats({ weapon: { itemId: 3, rarity: 0, affixes: [] } });
  const s5 = computeEquipStats({ weapon: { itemId: 3, rarity: 0, affixes: [], enchantLevel: MAX_ENCHANT_LEVEL } });
  assert.equal(s0.atk, 5, "未强化 baseAtk 5");
  assert.equal(s5.atk, 5, "+5 仅放大词缀，baseAtk 仍 5（proto 不放大）");
});

test("强化放大系数常量 = 0.15（C7 单一来源）", () => {
  assert.equal(ENCHANT_AFFIX_MULT_PER_LEVEL, 0.15);
});

// ─────────────────────────────────────────────────────────────
// ② world 材料计数（精英/BOSS 击杀，独立于掉落 Rng 流）
// ─────────────────────────────────────────────────────────────

test("精英击杀 → actor.materials +1 + MaterialGainEvent（stones=1）", () => {
  const world = mkWorld({ seed: "mat-elite", tier: 1 });
  const elite = world.actors().find((a) => a.tier === 1)!;
  assert.equal(elite.hp, ENEMY_BASE_HP * 3, "精英 hp = 30×3 = 90");
  assert.ok(killAll(world, 0, 3, 2000), "精英（90hp）应被 SKILL4 击杀（36×3）");
  const p = player(world);
  assert.equal(p.materials, 1, "精英击杀 → 强化石 +1");
  const gains = world.consumeMaterialGains();
  assert.deepEqual(gains, [{ seatId: 0, stones: 1 }], "MaterialGainEvent 携带 seatId + stones=1");
  assert.equal(world.consumeMaterialGains().length, 0, "消费后缓冲清空");
});

test("BOSS 击杀 → actor.materials +2 + MaterialGainEvent（stones=2）", () => {
  const world = mkWorld({ seed: "mat-boss", tier: 2 });
  const boss = world.actors().find((a) => a.tier === 2)!;
  assert.equal(boss.hp, ENEMY_BASE_HP * 10, "BOSS hp = 30×10 = 300");
  assert.ok(killAll(world, 0, 3, 5000), "BOSS（300hp）应被 SKILL4 击杀（36×9）");
  const p = player(world);
  assert.equal(p.materials, 2, "BOSS 击杀 → 强化石 +2");
  const gains = world.consumeMaterialGains();
  assert.deepEqual(gains, [{ seatId: 0, stones: 2 }], "MaterialGainEvent stones=2");
});

test("普通怪击杀 → 无材料事件（materials 保持 0）", () => {
  const world = mkWorld({ seed: "mat-normal", tier: 0 });
  assert.ok(killAll(world, 0, 0, 1000), "普通怪（30hp）应被 SKILL1 击杀（20×2）");
  const p = player(world);
  assert.equal(p.materials, 0, "普通怪不给强化石");
  assert.equal(world.consumeMaterialGains().length, 0, "无 MaterialGainEvent");
});

test("材料计数独立于掉落 Rng 流（同 seed 击杀 → 掉装与无掉装材料均必得）", () => {
  // 材料必得（不走 Rng）；掉装仍按 rollLoot 流（normal 0.3，此 seed 可能不出装）。
  const w1 = mkWorld({ seed: "mat-det", tier: 0 });
  assert.ok(killAll(w1, 0, 0, 1000));
  const w2 = mkWorld({ seed: "mat-det", tier: 0 });
  assert.ok(killAll(w2, 0, 0, 1000));
  // 同 seed ⇒ 同掉装结果（D9）。
  const drops1 = w1.actors().filter((a) => a.kind === EntityKind.LOOT_GROUND).map((a) => a.loot?.itemId);
  const drops2 = w2.actors().filter((a) => a.kind === EntityKind.LOOT_GROUND).map((a) => a.loot?.itemId);
  assert.deepEqual(drops1, drops2, "同 seed 同输入 ⇒ 同掉装（D9）");
  assert.equal(player(w1).materials, player(w2).materials, "同 seed ⇒ 同材料（确定性）");
});

// ─────────────────────────────────────────────────────────────
// ③ C12：materials 不进 EntityState 快照
// ─────────────────────────────────────────────────────────────

test("materials 不进 EntityState 快照（C12，防污染确定性 journal）", () => {
  const world = mkWorld({ seed: "mat-c12", tier: 1 });
  assert.ok(killAll(world, 0, 3, 2000));
  assert.equal(player(world).materials, 1, "world 内部计数已累计");
  const json = JSON.stringify(world.snapshot().entities);
  assert.ok(!json.includes("materials"), "快照序列化不含 materials 字段（C12 条件序列化纪律）");
});
