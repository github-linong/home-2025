/**
 * set.test.ts — E32 装备套装（纯函数 + 掉落映射，确定性 D9）
 * ===========================================================================
 * 覆盖：
 *   - setIdForDrop：套装只在特定来源掉（铁骨=石牢 biome1、鬼影=荒冢 biome2、
 *     烈阳=熔窟 biome3；对应主题 BOSS 宝箱出本主题套装；biome0/未知/主世界 → 0 → golden 不变）；
 *   - computeEquipStats 套装加成：2 件/3 件阈值、累计（3 件 = 2 件 + 3 件）、
 *     不同套装、单件无加成、不同套装混搭无加成；
 *   - 六类 affix 映射正确（atk/maxHp/reduction/critChance/attackSpeed/moveSpeed）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setIdForDrop,
  BIOME_DEFAULT,
  BIOME_STONE_PRISON,
  BIOME_BARROW,
  BIOME_MOLTEN_CAVERN,
  SET_IRONBONE,
  SET_WRAITH,
  SET_BLAZING_SUN,
} from "../../src/constants.ts";
import {
  computeEquipStats,
  setBonus,
  SET_DEFS,
  type EquippedSlots,
} from "../../src/affixes.ts";

type Slot = "weapon" | "armor" | "trinket";

/** 构造 3 槽已穿戴（itemId 映射：3=weapon / 4=armor / 5=trinket；无词缀、白装，隔离套装加成）。 */
function eq(items: Array<{ slot: Slot; setId?: number }>): EquippedSlots {
  const e: EquippedSlots = {};
  for (const it of items) {
    const itemId = it.slot === "weapon" ? 3 : it.slot === "armor" ? 4 : 5;
    e[it.slot] = { itemId, rarity: 0, affixes: [], ...(it.setId ? { setId: it.setId } : {}) };
  }
  return e;
}

// ─────────────────────────────────────────────────────────────
// ① setIdForDrop：套装掉落来源（biome / BOSS 宝箱）
// ─────────────────────────────────────────────────────────────

test("setIdForDrop：三主题闭环（铁骨=石牢、鬼影=荒冢、烈阳=熔窟；对应 BOSS 宝箱出本主题套装）", () => {
  // 普通/精英掉落（source="drop"）。
  assert.equal(setIdForDrop(BIOME_STONE_PRISON, "drop"), SET_IRONBONE, "石牢掉铁骨");
  assert.equal(setIdForDrop(BIOME_BARROW, "drop"), SET_WRAITH, "荒冢掉鬼影");
  assert.equal(setIdForDrop(BIOME_MOLTEN_CAVERN, "drop"), SET_BLAZING_SUN, "熔窟普通/精英掉烈阳（E33 主产地）");
  assert.equal(setIdForDrop(BIOME_DEFAULT, "drop"), 0, "普通副本不掉套装（golden 不变）");
  // BOSS 宝箱（source="boss-chest"）：三主题闭环——对应主题 BOSS 出本主题套装；biome0 不掉。
  assert.equal(setIdForDrop(BIOME_STONE_PRISON, "boss-chest"), SET_IRONBONE, "石牢 BOSS 宝箱掉铁骨（三主题闭环）");
  assert.equal(setIdForDrop(BIOME_BARROW, "boss-chest"), SET_WRAITH, "荒冢 BOSS 宝箱掉鬼影（三主题闭环）");
  assert.equal(setIdForDrop(BIOME_MOLTEN_CAVERN, "boss-chest"), SET_BLAZING_SUN, "熔窟 BOSS 宝箱掉烈阳（E33）");
  assert.equal(setIdForDrop(BIOME_DEFAULT, "boss-chest"), 0, "普通副本 BOSS 宝箱不掉套装（golden 不变）");
  // 未知 biome / 越界 → 0。
  assert.equal(setIdForDrop(999, "drop"), 0, "未知 biome 不掉套装");
  assert.equal(setIdForDrop(999, "boss-chest"), 0, "未知 biome BOSS 宝箱不掉套装");
  assert.equal(setIdForDrop(-1, "drop"), 0, "越界 biome 不掉套装");
});

// ─────────────────────────────────────────────────────────────
// ② computeEquipStats 套装加成（2 件 / 3 件阈值 + 累计）
// ─────────────────────────────────────────────────────────────

test("铁骨套装：2 件 maxHp+30；3 件 maxHp+90（累计）+ reduction+8%", () => {
  assert.equal(computeEquipStats(eq([{ slot: "weapon", setId: SET_IRONBONE }])).maxHp, 0, "单件无套装加成");
  const two = computeEquipStats(eq([{ slot: "weapon", setId: SET_IRONBONE }, { slot: "armor", setId: SET_IRONBONE }]));
  assert.equal(two.maxHp, 50, "2 件 maxHp = base(0+20) + 30 = 50");
  assert.equal(two.reduction, 0, "2 件无 reduction");
  const three = computeEquipStats(eq([
    { slot: "weapon", setId: SET_IRONBONE },
    { slot: "armor", setId: SET_IRONBONE },
    { slot: "trinket", setId: SET_IRONBONE },
  ]));
  assert.equal(three.atk, 7, "3 件 atk = 武器 baseAtk5 + 饰品 baseAtk2 = 7（无 atk 加成）");
  assert.equal(three.maxHp, 115, "3 件 maxHp = base(0+20+5) + (30+60) = 115");
  assert.equal(three.reduction, 0.08, "3 件 reduction = 8% = 0.08");
});

test("鬼影套装：2 件 attackSpeed+8%；3 件 attackSpeed+13%（累计）+ moveSpeed+12%", () => {
  const two = computeEquipStats(eq([{ slot: "weapon", setId: SET_WRAITH }, { slot: "armor", setId: SET_WRAITH }]));
  assert.equal(two.attackSpeed, 0.08, "2 件 attackSpeed 8%");
  assert.equal(two.moveSpeed, 0, "2 件无 moveSpeed");
  const three = computeEquipStats(eq([
    { slot: "weapon", setId: SET_WRAITH },
    { slot: "armor", setId: SET_WRAITH },
    { slot: "trinket", setId: SET_WRAITH },
  ]));
  assert.equal(three.attackSpeed, 0.13, "3 件 attackSpeed = 8% + 5% = 13%");
  assert.equal(three.moveSpeed, 0.12, "3 件 moveSpeed = 12%");
});

test("烈阳套装：2 件 critChance+8%；3 件 critChance+13%（累计）+ atk+20", () => {
  const two = computeEquipStats(eq([{ slot: "weapon", setId: SET_BLAZING_SUN }, { slot: "armor", setId: SET_BLAZING_SUN }]));
  assert.equal(two.critChance, 0.08, "2 件 critChance 8%");
  const three = computeEquipStats(eq([
    { slot: "weapon", setId: SET_BLAZING_SUN },
    { slot: "armor", setId: SET_BLAZING_SUN },
    { slot: "trinket", setId: SET_BLAZING_SUN },
  ]));
  assert.equal(three.critChance, 0.13, "3 件 critChance = 8% + 5% = 13%");
  assert.equal(three.atk, 27, "3 件 atk = base(5+2) + 20 = 27");
});

// ─────────────────────────────────────────────────────────────
// ③ 单件无加成 / 不同套装混搭无加成 / 无 setId
// ─────────────────────────────────────────────────────────────

test("单件 / 不同套装混搭 / 无 setId → 无套装加成", () => {
  // 单件（同 setId 仅 1 件）。
  const single = computeEquipStats(eq([{ slot: "weapon", setId: SET_IRONBONE }]));
  assert.equal(single.maxHp, 0, "单件无 maxHp 加成");
  assert.equal(single.reduction, 0, "单件无 reduction");
  // 不同套装混搭（各 1 件）。
  const mixed = computeEquipStats(eq([{ slot: "weapon", setId: SET_IRONBONE }, { slot: "armor", setId: SET_WRAITH }]));
  assert.equal(mixed.maxHp, 20, "混搭 maxHp 仅 armor base 20（无套装加成）");
  assert.equal(mixed.attackSpeed, 0, "混搭无鬼影 2 件加成");
  // 无 setId。
  const none = computeEquipStats(eq([{ slot: "weapon" }, { slot: "armor" }]));
  assert.equal(none.maxHp, 20, "无 setId 仅 base（weapon baseMaxHp0 + armor 20）");
});

// ─────────────────────────────────────────────────────────────
// ④ setBonus 纯函数 + SET_DEFS 表完整性
// ─────────────────────────────────────────────────────────────

test("setBonus 返回与 computeEquipStats 叠加一致的独立汇总（纯函数）", () => {
  const equipped = eq([
    { slot: "weapon", setId: SET_IRONBONE },
    { slot: "armor", setId: SET_IRONBONE },
    { slot: "trinket", setId: SET_IRONBONE },
  ]);
  const sb = setBonus(equipped);
  assert.equal(sb.maxHp, 90, "setBonus 独立汇总 maxHp = 30 + 60");
  assert.equal(sb.reduction, 0.08, "setBonus 独立汇总 reduction = 0.08");
  assert.equal(setBonus(undefined).atk, 0, "undefined → 零套装加成");
  assert.equal(setBonus({}).maxHp, 0, "空槽 → 零套装加成");
});

test("SET_DEFS 三套齐全且数值与 design 一致（C7 单一来源）", () => {
  assert.deepEqual(Object.keys(SET_DEFS).map(Number).sort(), [SET_IRONBONE, SET_WRAITH, SET_BLAZING_SUN].sort());
  assert.equal(SET_DEFS[SET_IRONBONE].name, "铁骨套装");
  assert.equal(SET_DEFS[SET_WRAITH].name, "鬼影套装");
  assert.equal(SET_DEFS[SET_BLAZING_SUN].name, "烈阳套装");
  assert.deepEqual(SET_DEFS[SET_IRONBONE].bonuses[2], [{ stat: "maxHp", value: 30 }]);
  assert.deepEqual(SET_DEFS[SET_IRONBONE].bonuses[3], [{ stat: "reduction", value: 8 }, { stat: "maxHp", value: 60 }]);
  assert.deepEqual(SET_DEFS[SET_WRAITH].bonuses[2], [{ stat: "attackSpeed", value: 8 }]);
  assert.deepEqual(SET_DEFS[SET_WRAITH].bonuses[3], [{ stat: "moveSpeed", value: 12 }, { stat: "attackSpeed", value: 5 }]);
  assert.deepEqual(SET_DEFS[SET_BLAZING_SUN].bonuses[2], [{ stat: "critChance", value: 8 }]);
  assert.deepEqual(SET_DEFS[SET_BLAZING_SUN].bonuses[3], [{ stat: "atk", value: 20 }, { stat: "critChance", value: 5 }]);
});
