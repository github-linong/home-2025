/**
 * attack.test.ts — E8 普攻（InputAction.ATTACK）单测（服务端权威，确定性）
 * ===========================================================================
 * 覆盖（全部固定 seed + 固定输入，D9）：
 *   - 范围内命中 → 敌人 hp 下降（基础伤害 PLAYER_BASE_ATK=8）
 *   - 范围外不命中（距离 > MELEE_RANGE → hp 不变，不设 CD）
 *   - CD 内不发（连续 ATTACK → 第二发被 ATTACK_CD_TICKS 拦截）
 *   - CD 恢复后再次攻击（ATTACK_CD_TICKS 后再次命中）
 *   - 伤害 = PLAYER_BASE_ATK + 装备 atk 加成
 *   - 暴击复用（critChance≥100% → ×1.5；同 seed 同装备同输入 ⇒ 同伤害，D9）
 *   - 目标校验：无 targetEntityId / 非敌人（玩家/入口/掉落）/ 死亡 → 静默忽略
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction } from "../../src/types.ts";
import {
  TILE,
  PLAYER_BASE_ATK,
  MELEE_RANGE,
  ATTACK_CD_TICKS,
} from "../../src/constants.ts";
import type { EquippedSlots } from "../../src/affixes.ts";

const PLAYER_X = 16 * TILE; // 768
const PLAYER_Y = 15 * TILE; // 720
const NEAR = { x: PLAYER_X, y: PLAYER_Y };
const PROX_SEED = "seed17"; // 与 world-combat/equip 同 seed：敌人散布 ≈12px，恒在普攻范围(48)内

function mkWorld(opts: { seed?: string; equipped?: EquippedSlots; zonePos?: { x: number; y: number } } = {}): World {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "E8-ATTACK",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    spawnZones: [{ pos: opts.zonePos ?? NEAR, tier: 0, enemyTypeId: "n", count: 1, aggression: "passive" }],
  });
  if (opts.equipped) world.setPlayerEquipped(0, opts.equipped);
  return world;
}

function enemy(world: World) {
  return world.actors().find((a) => a.kind === EntityKind.ENEMY);
}
function player(world: World) {
  return world.actors().find((a) => a.ownerId === 0)!;
}

/** 发一次 ATTACK 并 step；targetId 缺省取当前敌人 id。 */
function strike(world: World, seq: { s: number }, targetId?: number): void {
  world.enqueueInput(0, {
    seq: seq.s++,
    tick: world.tick,
    action: InputAction.ATTACK,
    dir: 0,
    ...(targetId !== undefined ? { targetEntityId: targetId } : {}),
  });
  world.step();
}

test("普攻：范围内命中 → 敌人 hp 下降（基础伤害 PLAYER_BASE_ATK=8）", () => {
  const world = mkWorld({ seed: PROX_SEED });
  const e0 = enemy(world)!;
  assert.ok(e0.hp === 30, "普通怪基础 hp=30");
  const seq = { s: 0 };
  strike(world, seq, e0.id);
  const e1 = enemy(world)!;
  assert.equal(e1.hp, 30 - PLAYER_BASE_ATK, `普攻命中 → hp = 30 - ${PLAYER_BASE_ATK} = ${30 - PLAYER_BASE_ATK}`);
  assert.equal(player(world).attackCdTicks, ATTACK_CD_TICKS, "命中后普攻 CD 置为 ATTACK_CD_TICKS");
});

test("普攻：范围外不命中（距离 > MELEE_RANGE → hp 不变，不设 CD）", () => {
  // 刷怪点远离玩家（> MELEE_RANGE）→ 敌人不在近战范围。
  const world = mkWorld({ seed: "E8-FAR", zonePos: { x: 4 * TILE, y: 4 * TILE } });
  const e0 = enemy(world)!;
  const d = Math.hypot(e0.x - player(world).x, e0.y - player(world).y);
  assert.ok(d > MELEE_RANGE, `敌人距玩家 ${d.toFixed(0)}px > MELEE_RANGE(${MELEE_RANGE})`);
  const seq = { s: 0 };
  strike(world, seq, e0.id);
  const e1 = enemy(world)!;
  assert.equal(e1.hp, 30, "范围外普攻不命中（hp 不变）");
  assert.equal(player(world).attackCdTicks, undefined, "范围外普攻不设 CD（可立即重试）");
});

test("普攻：CD 内不发（连续 ATTACK → 第二发被 CD 拦截）", () => {
  const world = mkWorld({ seed: PROX_SEED });
  const e0 = enemy(world)!;
  const seq = { s: 0 };
  strike(world, seq, e0.id); // 命中 → hp 22，cd=6
  assert.equal(enemy(world)!.hp, 30 - PLAYER_BASE_ATK);
  strike(world, seq, e0.id); // CD 内 → 拦截
  assert.equal(enemy(world)!.hp, 30 - PLAYER_BASE_ATK, "CD 内第二发不造成伤害");
});

test("普攻：CD 恢复后再次攻击（ATTACK_CD_TICKS 后再次命中）", () => {
  const world = mkWorld({ seed: PROX_SEED });
  const e0 = enemy(world)!;
  const seq = { s: 0 };
  strike(world, seq, e0.id); // 命中 → hp 22
  assert.equal(enemy(world)!.hp, 30 - PLAYER_BASE_ATK);
  // 无输入步进 ATTACK_CD_TICKS → cd 归零（每 tick 递减 1）。
  for (let i = 0; i < ATTACK_CD_TICKS; i++) world.step();
  assert.equal(player(world).attackCdTicks, 0, "CD 已归零");
  strike(world, seq, e0.id); // 恢复 → 再次命中
  assert.equal(enemy(world)!.hp, 30 - 2 * PLAYER_BASE_ATK, "CD 恢复后第二次普攻命中");
});

test("普攻：伤害 = PLAYER_BASE_ATK + 装备 atk 加成（weapon baseAtk 5 + 词缀 atk 3）", () => {
  // itemId=3 → weapon（baseAtk 5）；affix 1（atk 2）gold → value=round(2*1.7)=3 ⇒ 装备 atk=8。
  const world = mkWorld({
    seed: PROX_SEED,
    equipped: { weapon: { itemId: 3, rarity: 2, affixes: [1] } },
  });
  const e0 = enemy(world)!;
  const seq = { s: 0 };
  strike(world, seq, e0.id);
  const dmg = 30 - enemy(world)!.hp;
  assert.equal(dmg, PLAYER_BASE_ATK + 8, `普攻伤害 = ${PLAYER_BASE_ATK} + 装备 atk(8) = ${PLAYER_BASE_ATK + 8}`);
});

test("普攻：暴击复用（critChance≥100% → ×1.5；同 seed 同装备 ⇒ 同伤害，D9）", () => {
  // trinket（itemId=5，baseAtk 2）带 5× darkgold critChance（24%×5=120% → 必暴）。
  const equipped: EquippedSlots = { trinket: { itemId: 5, rarity: 3, affixes: [40, 40, 40, 40, 40] } };
  const run = (): number => {
    const w = mkWorld({ seed: "E8-CRIT", equipped });
    const e = enemy(w)!;
    const seq = { s: 0 };
    strike(w, seq, e.id);
    return 30 - enemy(w)!.hp;
  };
  const dmg1 = run();
  const dmg2 = run();
  const expected = Math.round((PLAYER_BASE_ATK + 2) * 1.5); // (8+2)×1.5 = 15
  assert.equal(dmg1, expected, `必暴 ⇒ 普攻 ×1.5 = ${expected}`);
  assert.equal(dmg2, expected, "同 seed 同装备同输入 ⇒ 同伤害（D9）");
});

test("普攻：目标校验 —— 无 targetEntityId / 非敌人 / 目标死亡 → 静默忽略", () => {
  const world = mkWorld({ seed: PROX_SEED });
  const seq = { s: 0 };
  // 无 targetEntityId → 忽略。
  strike(world, seq);
  assert.equal(enemy(world)!.hp, 30, "无目标不命中");
  assert.equal(player(world).attackCdTicks, undefined, "无目标不设 CD");
  // 目标 = 玩家自己（kind=PLAYER）→ 忽略。
  strike(world, seq, player(world).id);
  assert.equal(player(world).hp, 100, "普攻不能命中玩家");
  // 目标 = 入口（kind=ENTRANCE）→ 忽略。
  const entrance = world.actors().find((a) => a.kind === EntityKind.ENTRANCE)!;
  strike(world, seq, entrance.id);
  assert.equal(entrance.hp, 1, "普攻不能命中入口");
  // 持续普攻（无装备 8dmg，CD 6tick → 每 ~7 tick 一击；60 步足可击杀 30hp）。
  const e0 = enemy(world)!;
  for (let i = 0; i < 60 && enemy(world); i++) strike(world, seq, e0.id);
  assert.ok(!enemy(world), "敌人应已被普攻击杀并移除");
  // 对已死/不存在目标普攻 → 静默忽略（无副作用）。
  const pBefore = player(world).hp;
  strike(world, seq, e0.id);
  assert.equal(player(world).hp, pBefore, "对死亡目标普攻无副作用");
});
