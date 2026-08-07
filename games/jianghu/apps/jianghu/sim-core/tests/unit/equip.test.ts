/**
 * equip.test.ts — E7 装备进战斗（world 级集成，确定性）
 * ===========================================================================
 * 覆盖（全部固定 seed + 固定输入，D9）：
 *   - 无装备攻击力 = 基础（playtest golden 锚点：SKILL_DAMAGE 原值，无装备不变）；
 *   - 装备 atk 词缀 → 攻击力↑（技能 baseAmount = 技能伤害 + 装备 atk）；
 *   - maxHp 加成生效（setPlayerEquipped → maxHp/ hp 同步）；
 *   - reduction 进结算（敌人接触伤害 ×(1-减伤)）；
 *   - crit 确定性 + ×1.5（同 seed 同输入 → 同序列；100% 暴击下技能 ×1.5）；
 *   - attackSpeed 缩短技能 CD（无装备 = 原 CD，golden 锚点）；
 *   - moveSpeed 提速（无装备 = 原速，golden 锚点）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction } from "../../src/types.ts";
import { TILE, SKILL_DAMAGE, SKILL_CD_BY_SLOT, CELLS_PER_TICK, ENEMY_WINDUP_TICKS } from "../../src/constants.ts";
import type { EquippedSlots } from "../../src/affixes.ts";

const PLAYER_X = 16 * TILE; // 768
const PLAYER_Y = 15 * TILE; // 720
const NEAR = { x: PLAYER_X, y: PLAYER_Y };
const PROX_SEED = "seed17"; // 与 world-combat.test.ts 同 seed（散布稳定在技能/接触范围内）

function mkWorld(opts: {
  seed?: string;
  enemy?: "passive" | "aggressive";
  noEnemy?: boolean;
}): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "E7-EQUIP",
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    spawnZones: opts.noEnemy
      ? undefined
      : [{ pos: NEAR, tier: 0, enemyTypeId: "n", count: 1, aggression: opts.enemy ?? "passive" }],
  });
}

function issueSkill(world: World, seat: number, slot: number, seq: { s: number }) {
  world.enqueueInput(seat, { seq: seq.s++, tick: world.tick, action: InputAction.SKILL1 + slot, dir: 0, skillSlot: slot });
}

function findEnemy(world: World) {
  return world.actors().find((a) => a.kind === EntityKind.ENEMY);
}

function findPlayer(world: World) {
  return world.actors().find((a) => a.ownerId === 0)!;
}

/** 对敌人施放一次技能，返回敌人 hp（敌人死亡返回 0）。 */
function castOnce(world: World, seq: { s: number }, slot = 0): number {
  issueSkill(world, 0, slot, seq);
  world.step();
  const e = findEnemy(world);
  return e ? e.hp : 0;
}

// ------------------------------------------------------------------
// ① 无装备攻击力 = 基础（playtest golden 锚点）
// ------------------------------------------------------------------

test("无装备：技能伤害 = SKILL_DAMAGE 原值（30hp 敌人 -20 → 10）", () => {
  const world = mkWorld({ seed: PROX_SEED });
  const seq = { s: 0 };
  const hp = castOnce(world, seq, 0);
  assert.equal(hp, 30 - SKILL_DAMAGE[0], `无装备 slot0 伤害 = SKILL_DAMAGE[0]=${SKILL_DAMAGE[0]}`);
});

test("装备 atk 词缀 → 攻击力↑（baseAmount = SKILL_DAMAGE + 装备 atk）", () => {
  // itemId=3 → weapon（baseAtk 5）；affix 1（atk 2）gold → 3 ⇒ atk=8；slot0 = 20+8=28 → 30-28=2。
  const world = mkWorld({ seed: PROX_SEED, equipped: { weapon: { itemId: 3, rarity: 2, affixes: [1] } } });
  world.setPlayerEquipped(0, { weapon: { itemId: 3, rarity: 2, affixes: [1] } });
  const seq = { s: 0 };
  const hp = castOnce(world, seq, 0);
  assert.equal(hp, 2, `装备 atk=8 ⇒ 伤害 28 ⇒ hp 30→2（实测 ${hp}）`);
});

// ------------------------------------------------------------------
// ② maxHp 加成
// ------------------------------------------------------------------

test("maxHp 加成生效：装 armor maxHp → maxHp 提升且 hp 同步抬升；卸下 clamp", () => {
  const world = mkWorld({ seed: "e7-hp", noEnemy: true });
  const p0 = findPlayer(world);
  assert.equal(p0.maxHp, 100, "无装备 maxHp = 100");
  // itemId=4 → armor（baseMaxHp 20）；affix 13（maxHp 5）darkgold → round(5*2.4)=12 ⇒ 加成 32。
  world.setPlayerEquipped(0, { armor: { itemId: 4, rarity: 3, affixes: [13] } });
  const p1 = findPlayer(world);
  assert.equal(p1.maxHp, 132, "maxHp = 100 + 20 + 12 = 132");
  assert.equal(p1.hp, 132, "装 +maxHp 装备 hp 同步抬升（不亏血）");
  // 卸下 → 回 100，hp clamp 到新上限。
  world.setPlayerEquipped(0, {});
  const p2 = findPlayer(world);
  assert.equal(p2.maxHp, 100);
  assert.equal(p2.hp, 100, "卸下后 hp clamp 到 100");
});

// ------------------------------------------------------------------
// ③ reduction 进结算
// ------------------------------------------------------------------

test("reduction 进结算：敌人接触伤害 ×(1-减伤)（E18：前摇 ENEMY_WINDUP_TICKS 后落刀）", () => {
  const world = mkWorld({ seed: PROX_SEED, enemy: "aggressive" });
  // trinket（itemId=5，baseMaxHp 5）affix 30（reduction 8）darkgold → round(8*2.4)=19 → 19% 减伤。
  world.setPlayerEquipped(0, { trinket: { itemId: 5, rarity: 3, affixes: [30] } });
  world.step(); // t=0 敌人进入前摇（WINDUP），伤害未结算
  for (let i = 0; i < ENEMY_WINDUP_TICKS; i++) world.step(); // t=1..5 → t=5 落刀（atk=8，减伤 19% → round(8*0.81)=6）
  const p = findPlayer(world);
  // 装 trinket 抬 maxHp(+5) → hp=105；受击 6 → 99（若无减伤则 105-8=97，差值 2 证明减伤生效）。
  assert.equal(p.hp, 105 - 6, "hp = 105（含 trinket baseMaxHp+5）- 6（8 × (1-0.19)）");
  assert.equal(p.maxHp, 105, "trinket baseMaxHp 5 → maxHp 105");
});

// ------------------------------------------------------------------
// ④ crit 确定性 + ×1.5
// ------------------------------------------------------------------

test("crit：100% 暴击（critChance≥1）→ 技能 ×1.5 确定性", () => {
  // trinket（itemId=5，baseAtk 2）带 5 条 darkgold critChance（24%×5=120% → 必暴）。
  const equipped: EquippedSlots = { trinket: { itemId: 5, rarity: 3, affixes: [40, 40, 40, 40, 40] } };
  const w1 = mkWorld({ seed: "e7-crit" });
  w1.setPlayerEquipped(0, equipped);
  const seq = { s: 0 };
  const hp1 = castOnce(w1, seq, 0); // base = 20 + trinket.atk(2) = 22 → ×1.5 = 33 → 30-33 < 0 → 死亡
  assert.equal(hp1, 0, "必暴 ⇒ 单发 33 击杀 30hp 敌人");

  // 同 seed + 同装备重跑 → 字节级一致（D9）。
  const w2 = mkWorld({ seed: "e7-crit" });
  w2.setPlayerEquipped(0, equipped);
  const seq2 = { s: 0 };
  assert.equal(castOnce(w2, seq2, 0), hp1, "同 seed 同装备 ⇒ 同伤害序列（D9）");

  // 对照组：同装备但无 crit 词缀 → 单发 22 → hp 8（证明 ×1.5 来自 crit）。
  const w3 = mkWorld({ seed: "e7-crit" });
  w3.setPlayerEquipped(0, { trinket: { itemId: 5, rarity: 3, affixes: [] } });
  const seq3 = { s: 0 };
  assert.equal(castOnce(w3, seq3, 0), 8, "无暴击 ⇒ 伤害 22 ⇒ hp 8");
});

// ------------------------------------------------------------------
// ⑤ attackSpeed 缩短技能 CD
// ------------------------------------------------------------------

test("attackSpeed 缩短技能 CD；无装备 = 原 CD（golden 锚点）", () => {
  const world = mkWorld({ seed: "e7-as", noEnemy: true });
  const seq = { s: 0 };
  issueSkill(world, 0, 0, seq); // 无装备 → cd = SKILL_CD_BY_SLOT[0]
  world.step();
  assert.equal(findPlayer(world).skillCd![0], SKILL_CD_BY_SLOT[0], "无装备 cd = 原值");

  // trinket affix 50（attackSpeed 10）darkgold → 24% → cd = round(36 * 0.76) = 27。
  const w2 = mkWorld({ seed: "e7-as2", noEnemy: true });
  w2.setPlayerEquipped(0, { trinket: { itemId: 5, rarity: 3, affixes: [50] } });
  const seq2 = { s: 0 };
  issueSkill(w2, 0, 0, seq2);
  w2.step();
  assert.equal(findPlayer(w2).skillCd![0], Math.round(SKILL_CD_BY_SLOT[0] * 0.76), "attackSpeed 24% ⇒ cd 缩短");
});

// ------------------------------------------------------------------
// ⑥ moveSpeed 提速
// ------------------------------------------------------------------

test("moveSpeed 提速；无装备 = 原速（golden 锚点）", () => {
  // 无装备：5 tick 位移 = CELLS_PER_TICK*TILE*5 = 16px*5。
  const wBase = mkWorld({ seed: "e7-ms", noEnemy: true });
  const x0 = findPlayer(wBase).x;
  for (let i = 0; i < 5; i++) {
    wBase.enqueueInput(0, { seq: i + 1, tick: 0, action: InputAction.MOVE, dir: 0 });
    wBase.step();
  }
  const perBase = (findPlayer(wBase).x - x0) / 5;
  assert.ok(Math.abs(perBase - CELLS_PER_TICK * TILE) < 1e-9, `无装备每 tick 位移 = ${perBase} ≈ 16px`);

  // 装备 moveSpeed（affix 64：14 → darkgold 34 → 34%）→ 位移提升。
  const wFast = mkWorld({ seed: "e7-ms", noEnemy: true });
  wFast.setPlayerEquipped(0, { trinket: { itemId: 5, rarity: 3, affixes: [64] } });
  const x0f = findPlayer(wFast).x;
  for (let i = 0; i < 5; i++) {
    wFast.enqueueInput(0, { seq: i + 1, tick: 0, action: InputAction.MOVE, dir: 0 });
    wFast.step();
  }
  const perFast = (findPlayer(wFast).x - x0f) / 5;
  assert.ok(perFast > perBase, `moveSpeed ⇒ 位移提升（base=${perBase.toFixed(2)} fast=${perFast.toFixed(2)}px/tick）`);
});
