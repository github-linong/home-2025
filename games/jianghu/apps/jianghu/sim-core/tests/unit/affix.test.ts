/**
 * affix.test.ts — E7 词缀表 / 物品原型 / 装备属性单测（确定性）
 * ===========================================================================
 * 覆盖：
 *   - 词缀表完整性：1..AFFIX_ID_MAX(64) 均有定义，stat ∈ 6 类，value > 0；
 *   - 稀有度强度：同词缀 金/暗金 value 更高（1 / 1.3 / 1.7 / 2.4，严格单调）；
 *   - 确定性：静态表无随机（同调用恒同值 / 同引用）；
 *   - itemProto：itemId → 槽位确定性映射（同 id 恒同槽位）；
 *   - computeEquipStats：空装备全零；weapon atk / armor maxHp / reduction / crit / attackSpeed / moveSpeed 汇总。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  AFFIX_TABLE,
  AFFIX_STATS,
  affixDef,
  affixValue,
  RARITY_VALUE_MULT,
  itemProto,
  ITEM_PROTOS,
  computeEquipStats,
  EMPTY_EQUIP_STATS,
  type EquippedSlots,
} from "../../src/affixes.ts";
import { AFFIX_ID_MAX } from "../../src/constants.ts"; // C7 单一来源（词缀 id 池上限）

test("词缀表完整性：1..AFFIX_ID_MAX(64) 全有定义，stat ∈ 6 类，value > 0", () => {
  const stats = new Set<string>();
  for (let id = 1; id <= AFFIX_ID_MAX; id++) {
    const def = affixDef(id);
    assert.ok(def, `affix ${id} must be defined`);
    assert.equal(def.id, id);
    assert.ok(def.name.length > 0, `affix ${id} must have name`);
    assert.ok(AFFIX_STATS.includes(def.stat), `affix ${id} stat ${def.stat} ∈ 6 类`);
    assert.ok(def.value > 0, `affix ${id} value must be > 0`);
    stats.add(def.stat);
  }
  // 6 类 stat 全覆盖（表内至少各 1 条）。
  assert.equal(stats.size, AFFIX_STATS.length, `all 6 stats covered (got ${[...stats].join(",")})`);
  // 表行数与 id 上界一致（无缺失/无越界）。
  assert.equal(Object.keys(AFFIX_TABLE).length, AFFIX_ID_MAX);
});

test("稀有度强度：同词缀 金/暗金 value 更高（1 / 1.3 / 1.7 / 2.4 单调）", () => {
  // 系数本身严格单调（稀有度 0<1<2<3）。
  assert.ok(RARITY_VALUE_MULT[0] < RARITY_VALUE_MULT[1]);
  assert.ok(RARITY_VALUE_MULT[1] < RARITY_VALUE_MULT[2]);
  assert.ok(RARITY_VALUE_MULT[2] < RARITY_VALUE_MULT[3]);
  // 对每个词缀：affixValue 随稀有度非减；且 金 > 白（value ≥ 1 ⇒ round(1.7v) > v）。
  for (let id = 1; id <= AFFIX_ID_MAX; id++) {
    const w = affixValue(id, 0);
    const b = affixValue(id, 1);
    const g = affixValue(id, 2);
    const dg = affixValue(id, 3);
    assert.ok(w <= b && b <= g && g <= dg, `affix ${id} rarity monotonic non-decreasing`);
    assert.ok(g > w, `affix ${id}: gold value(${g}) > white value(${w})`);
    assert.ok(dg >= g, `affix ${id}: darkgold >= gold`);
  }
  // 具体锚点：id 1（atk 2）白=2 / 金=round(2*1.7)=3。
  assert.equal(affixValue(1, 0), 2);
  assert.equal(affixValue(1, 2), Math.round(2 * 1.7));
});

test("确定性：静态表无随机（同调用恒同值 / 同对象引用）", () => {
  for (let i = 0; i < 5; i++) {
    assert.equal(affixValue(7, 2), affixValue(7, 2), `affixValue deterministic (iter ${i})`);
    assert.equal(affixValue(33, 3), affixValue(33, 3), `affixValue deterministic (iter ${i})`);
  }
  assert.equal(affixDef(10), affixDef(10), "affixDef returns stable (same frozen object) reference");
});

test("itemProto：itemId → 槽位确定性映射；同 id 恒同槽位", () => {
  assert.equal(ITEM_PROTOS.length, 3, "3 槽原型（weapon/armor/trinket）");
  for (const p of ITEM_PROTOS) {
    assert.ok(["weapon", "armor", "trinket"].includes(p.slot), `slot ${p.slot} ∈ 3 槽`);
    assert.ok(p.baseAtk >= 0 && p.baseMaxHp >= 0, "baseAtk/baseMaxHp 非负");
  }
  // itemId % 3：0→weapon 1→armor 2→trinket；重复调用恒同。
  for (const id of [1, 3, 5, 777, 2115625910]) {
    assert.equal(itemProto(id), itemProto(id), `itemProto(${id}) deterministic`);
    assert.ok(["weapon", "armor", "trinket"].includes(itemProto(id).slot));
  }
  assert.equal(itemProto(3).slot, "weapon", "3 % 3 = 0 → weapon");
  assert.equal(itemProto(4).slot, "armor", "4 % 3 = 1 → armor");
  assert.equal(itemProto(5).slot, "trinket", "5 % 3 = 2 → trinket");
});

test("computeEquipStats：空装备 → 全零（golden 锚点）", () => {
  const s = computeEquipStats(undefined);
  assert.deepEqual(s, { ...EMPTY_EQUIP_STATS }, "undefined → zeros");
  assert.deepEqual(computeEquipStats({}), { ...EMPTY_EQUIP_STATS }, "empty slots → zeros");
});

test("computeEquipStats：weapon atk（baseAtk + atk 词缀）", () => {
  // itemId=3 → weapon（baseAtk 5）；affix 1（atk 2）gold → round(2*1.7)=3 ⇒ atk = 5+3 = 8。
  const equipped: EquippedSlots = { weapon: { itemId: 3, rarity: 2, affixes: [1] } };
  const s = computeEquipStats(equipped);
  assert.equal(s.atk, 8, "atk = weapon.baseAtk(5) + affixValue(1, gold)=3");
  assert.equal(s.maxHp, 0);
});

test("computeEquipStats：armor maxHp（baseMaxHp + maxHp 词缀）", () => {
  // itemId=4 → armor（baseMaxHp 20）；affix 13（maxHp 5）darkgold → round(5*2.4)=12 ⇒ maxHp = 20+12 = 32。
  const equipped: EquippedSlots = { armor: { itemId: 4, rarity: 3, affixes: [13] } };
  const s = computeEquipStats(equipped);
  assert.equal(s.maxHp, 32, "maxHp = armor.baseMaxHp(20) + affixValue(13, darkgold)=12");
  assert.equal(s.atk, 0);
});

test("computeEquipStats：reduction / crit / attackSpeed / moveSpeed 汇总（百分点 → 0..1）", () => {
  const equipped: EquippedSlots = {
    trinket: {
      itemId: 5, // trinket（baseAtk 2 / baseMaxHp 5）
      rarity: 3,
      affixes: [
        30, // reduction 8 → 8*2.4=19.2 → 19 → 0.19
        40, // critChance 10 → 24 → 0.24
        50, // attackSpeed 10 → 24 → 0.24
        64, // moveSpeed 14 → 14*2.4=33.6 → 34 → 0.34
      ],
    },
  };
  const s = computeEquipStats(equipped);
  assert.equal(s.reduction, 0.19);
  assert.equal(s.critChance, 0.24);
  assert.equal(s.attackSpeed, 0.24);
  assert.equal(s.moveSpeed, 0.34);
  assert.equal(s.atk, 2, "trinket baseAtk");
  assert.equal(s.maxHp, 5, "trinket baseMaxHp");
});

test("computeEquipStats：多槽叠加（weapon + armor + trinket）", () => {
  const equipped: EquippedSlots = {
    weapon: { itemId: 3, rarity: 0, affixes: [1] }, // atk = 5 + 2 = 7
    armor: { itemId: 4, rarity: 0, affixes: [13] }, // maxHp = 20 + 5 = 25
  };
  const s = computeEquipStats(equipped);
  assert.equal(s.atk, 7);
  assert.equal(s.maxHp, 25);
});
