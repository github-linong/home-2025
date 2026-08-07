/**
 * affixes.ts — 装备词缀表 + 物品原型 + 装备属性计算（E7 落地）
 * ===========================================================================
 * 纯静态确定性数据（C6：不依赖任何战斗/世界运行时；仅纯函数 + Math）。
 * - 词缀表：id 1..AFFIX_ID_MAX(64) → { name, stat, value }；stat ∈ 6 类
 *   （atk 攻击力 / maxHp 生命上限 / reduction 减伤% / critChance 暴击率 /
 *     attackSpeed 攻击间隔缩短% / moveSpeed 移速%）。
 * - 稀有度强度：同词缀按稀有度系数放大（RARITY_VALUE_MULT），金/暗金 value 更高。
 *   affixValue(id, rarity) = round(baseValue × mult[rarity])，确定性无随机（D9）。
 * - 物品原型表：ITEM_PROTOS（3 槽 weapon/armor/trinket → baseAtk/baseMaxHp）。
 *   itemProto(itemId) 以 itemId % len 确定性映射（**掉落后再映射**方案：不改 rollLoot
 *   rng 流 → playtest golden 稳定；见 E7 报告）。
 * - computeEquipStats(equipped)：纯函数汇总装备属性（proto 基础值 + 词缀值）。
 *
 * 纪律：本文件只含类型 / const 数据 / 纯函数；无 I/O、无随机、无全局可变状态。
 */
import { ENCHANT_AFFIX_MULT_PER_LEVEL } from "./constants.ts"; // E19：强化放大系数（C7 单一来源）

// ─────────────────────────────────────────────────────────────
// 词缀 stat 类型（6 类；combat/world 消费）
// ─────────────────────────────────────────────────────────────

export type AffixStat =
  | "atk" // 攻击力（点，平加到技能/普攻 baseAmount）
  | "maxHp" // 生命上限（点，加到 PLAYER_MAX_HP）
  | "reduction" // 减伤%（value 为百分点，如 8 = 8%）
  | "critChance" // 暴击率%（value 为百分点，如 10 = 10%；暴击 ×1.5）
  | "attackSpeed" // 攻击间隔缩短%（value 为百分点，如 10 = 10%）
  | "moveSpeed"; // 移速%（value 为百分点，如 12 = 12%）

/** 词缀 stat 全集（测试/文档用；C7 单一来源）。 */
export const AFFIX_STATS: readonly AffixStat[] = [
  "atk",
  "maxHp",
  "reduction",
  "critChance",
  "attackSpeed",
  "moveSpeed",
] as const;

/** 词缀定义（静态表行）。value = 白装基础值；实际值经 RARITY_VALUE_MULT 放大。 */
export interface AffixDef {
  readonly id: number;
  readonly name: string;
  readonly stat: AffixStat;
  readonly value: number;
}

/** 稀有度强度系数（索引 0=白/1=蓝/2=金/3=暗金，与 AFFIX_COUNTS / LootState.rarity 对齐）。 */
export const RARITY_VALUE_MULT = Object.freeze([1, 1.3, 1.7, 2.4]) as readonly [number, number, number, number];

function affix(id: number, name: string, stat: AffixStat, value: number): AffixDef {
  return Object.freeze({ id, name, stat, value });
}

/**
 * 词缀静态表（64 条，id 1..64 = AFFIX_ID_MAX）。
 * 分布：atk ×12（2..24 步进 2）、maxHp ×10（5..50 步进 5）、reduction ×8（1..8 百分点）、
 *       critChance ×10（1..10 百分点）、attackSpeed ×10（1..10 百分点）、moveSpeed ×14（1..14 百分点）。
 * 确定性：字面量表，无随机（D9）。
 */
export const AFFIX_TABLE: Readonly<Record<number, AffixDef>> = Object.freeze({
  // ── atk（1..12）──
  1: affix(1, "锐锋", "atk", 2),
  2: affix(2, "利爪", "atk", 4),
  3: affix(3, "铁刃", "atk", 6),
  4: affix(4, "重击", "atk", 8),
  5: affix(5, "破甲", "atk", 10),
  6: affix(6, "猛攻", "atk", 12),
  7: affix(7, "烈焰刃", "atk", 14),
  8: affix(8, "寒冰刺", "atk", 16),
  9: affix(9, "雷光斩", "atk", 18),
  10: affix(10, "龙牙", "atk", 20),
  11: affix(11, "虎爪", "atk", 22),
  12: affix(12, "天罚", "atk", 24),
  // ── maxHp（13..22）──
  13: affix(13, "生机", "maxHp", 5),
  14: affix(14, "坚韧", "maxHp", 10),
  15: affix(15, "厚皮", "maxHp", 15),
  16: affix(16, "铁骨", "maxHp", 20),
  17: affix(17, "石肤", "maxHp", 25),
  18: affix(18, "古木", "maxHp", 30),
  19: affix(19, "磐石", "maxHp", 35),
  20: affix(20, "龙血", "maxHp", 40),
  21: affix(21, "巨灵", "maxHp", 45),
  22: affix(22, "不灭", "maxHp", 50),
  // ── reduction（23..30，百分点）──
  23: affix(23, "守御", "reduction", 1),
  24: affix(24, "铁壁", "reduction", 2),
  25: affix(25, "不动", "reduction", 3),
  26: affix(26, "金刚", "reduction", 4),
  27: affix(27, "龟息", "reduction", 5),
  28: affix(28, "玄甲", "reduction", 6),
  29: affix(29, "玄武", "reduction", 7),
  30: affix(30, "不破", "reduction", 8),
  // ── critChance（31..40，百分点）──
  31: affix(31, "鹰眼", "critChance", 1),
  32: affix(32, "精准", "critChance", 2),
  33: affix(33, "要害", "critChance", 3),
  34: affix(34, "破绽", "critChance", 4),
  35: affix(35, "一瞬", "critChance", 5),
  36: affix(36, "致命", "critChance", 6),
  37: affix(37, "死神", "critChance", 7),
  38: affix(38, "修罗", "critChance", 8),
  39: affix(39, "无影", "critChance", 9),
  40: affix(40, "必中", "critChance", 10),
  // ── attackSpeed（41..50，百分点）──
  41: affix(41, "疾风", "attackSpeed", 1),
  42: affix(42, "迅捷", "attackSpeed", 2),
  43: affix(43, "电光", "attackSpeed", 3),
  44: affix(44, "影袭", "attackSpeed", 4),
  45: affix(45, "连斩", "attackSpeed", 5),
  46: affix(46, "追风", "attackSpeed", 6),
  47: affix(47, "骤雨", "attackSpeed", 7),
  48: affix(48, "流火", "attackSpeed", 8),
  49: affix(49, "星驰", "attackSpeed", 9),
  50: affix(50, "刹那", "attackSpeed", 10),
  // ── moveSpeed（51..64，百分点）──
  51: affix(51, "踏雪", "moveSpeed", 1),
  52: affix(52, "追月", "moveSpeed", 2),
  53: affix(53, "轻功", "moveSpeed", 3),
  54: affix(54, "掠影", "moveSpeed", 4),
  55: affix(55, "御风", "moveSpeed", 5),
  56: affix(56, "神行", "moveSpeed", 6),
  57: affix(57, "飞燕", "moveSpeed", 7),
  58: affix(58, "惊鸿", "moveSpeed", 8),
  59: affix(59, "腾云", "moveSpeed", 9),
  60: affix(60, "疾走", "moveSpeed", 10),
  61: affix(61, "捷足", "moveSpeed", 11),
  62: affix(62, "云步", "moveSpeed", 12),
  63: affix(63, "御空", "moveSpeed", 13),
  64: affix(64, "迅足", "moveSpeed", 14),
});

/** 取词缀定义（id 越界/缺失 → undefined）。 */
export function affixDef(id: number): AffixDef | undefined {
  return AFFIX_TABLE[id];
}

/**
 * 词缀实际值（确定性）：round(白装基础值 × RARITY_VALUE_MULT[rarity])。
 * 稀有度强度：同词缀 金/暗金 value 更高（1 / 1.3 / 1.7 / 2.4）。
 * rarity 越界归约到 0..3（防御）。
 */
export function affixValue(id: number, rarity: number): number {
  const def = affixDef(id);
  if (!def) return 0;
  const r = ((Math.trunc(rarity) % 4) + 4) % 4;
  return Math.round(def.value * RARITY_VALUE_MULT[r]);
}

// ─────────────────────────────────────────────────────────────
// 物品原型（3 槽）
// ─────────────────────────────────────────────────────────────

export type ItemSlot = "weapon" | "armor" | "trinket";

/** 物品原型：itemId 段 → 槽位 + 基础属性。 */
export interface ItemProto {
  readonly slot: ItemSlot;
  readonly baseAtk: number;
  readonly baseMaxHp: number;
}

/** 物品原型表（3 槽；weapon 主攻 / armor 主血 / trinket 均衡）。 */
export const ITEM_PROTOS: readonly ItemProto[] = Object.freeze([
  Object.freeze({ slot: "weapon", baseAtk: 5, baseMaxHp: 0 }),
  Object.freeze({ slot: "armor", baseAtk: 0, baseMaxHp: 20 }),
  Object.freeze({ slot: "trinket", baseAtk: 2, baseMaxHp: 5 }),
]);

/**
 * 由 itemId 确定性映射物品原型（掉落后再映射方案，不改 rollLoot rng 流 → golden 稳定）。
 * itemId % len（len=3）：0→weapon 1→armor 2→trinket。同 itemId ⇒ 恒同槽位（D9）。
 */
export function itemProto(itemId: number): ItemProto {
  const id = Math.trunc(itemId);
  const idx = ((id % ITEM_PROTOS.length) + ITEM_PROTOS.length) % ITEM_PROTOS.length;
  return ITEM_PROTOS[idx];
}

// ─────────────────────────────────────────────────────────────
// 装备槽 / 装备属性汇总
// ─────────────────────────────────────────────────────────────

/** 已穿戴物品（= InventoryItem 减去派生字段 slot；slot 由 itemId 可推导）。 */
export interface EquippedItem {
  readonly itemId: number;
  readonly rarity: number;
  readonly affixes: readonly number[];
  /** E19：强化等级（+N；缺省 0 = 未强化）。仅放大词缀 value，见 computeEquipStats。 */
  readonly enchantLevel?: number;
}

/** 装备槽（3 槽；缺省 undefined = 空槽）。 */
export type EquippedSlots = Partial<Record<ItemSlot, EquippedItem>>;

/** 装备汇总属性（供战斗/面板消费；单位已归一：reduction/crit/attackSpeed/moveSpeed 为 0..1）。 */
export interface EquipmentStats {
  readonly atk: number;
  readonly maxHp: number;
  readonly reduction: number;
  readonly critChance: number;
  readonly attackSpeed: number;
  readonly moveSpeed: number;
}

/** 空装备汇总（共享冻结常量，零分配；C6 热路径纪律）。 */
export const EMPTY_EQUIP_STATS: EquipmentStats = Object.freeze({
  atk: 0,
  maxHp: 0,
  reduction: 0,
  critChance: 0,
  attackSpeed: 0,
  moveSpeed: 0,
});

/**
 * 装备属性汇总（纯函数，无副作用）。
 * - atk      = Σ proto.baseAtk + Σ atk 词缀值
 * - maxHp    = Σ proto.baseMaxHp + Σ maxHp 词缀值
 * - reduction/critChance/attackSpeed/moveSpeed = Σ 词缀百分点 / 100（0..1）
 * E19 强化：词缀值 ×(1 + ENCHANT_AFFIX_MULT_PER_LEVEL × enchantLevel)（仅放大词缀，
 *   proto baseAtk/baseMaxHp 不放大）；enchantLevel 缺省 0 → 原值（golden 锚点）。
 * 无装备（undefined）→ 全零（EMPTY_EQUIP_STATS 副本；战斗侧无装备 = 原值，golden 锚点）。
 */
export function computeEquipStats(equipped: EquippedSlots | undefined): EquipmentStats {
  if (!equipped) return { ...EMPTY_EQUIP_STATS };
  const s = { atk: 0, maxHp: 0, reduction: 0, critChance: 0, attackSpeed: 0, moveSpeed: 0 };
  for (const slot of ["weapon", "armor", "trinket"] as const) {
    const item = equipped[slot];
    if (!item) continue;
    const proto = itemProto(item.itemId);
    s.atk += proto.baseAtk;
    s.maxHp += proto.baseMaxHp;
    // E19：强化放大词缀值（1 + 0.15×level；无强化 level=0 → 乘 1 → 原值，golden 锚点）。
    const enchantMult = 1 + ENCHANT_AFFIX_MULT_PER_LEVEL * (item.enchantLevel ?? 0);
    for (const affixId of item.affixes) {
      const def = affixDef(affixId);
      if (!def) continue;
      const v = Math.round(affixValue(affixId, item.rarity) * enchantMult);
      switch (def.stat) {
        case "atk": s.atk += v; break;
        case "maxHp": s.maxHp += v; break;
        case "reduction": s.reduction += v / 100; break;
        case "critChance": s.critChance += v / 100; break;
        case "attackSpeed": s.attackSpeed += v / 100; break;
        case "moveSpeed": s.moveSpeed += v / 100; break;
      }
    }
  }
  return s;
}

/** 空装备槽（构造新角色/游客默认）。 */
export function emptyEquipped(): EquippedSlots {
  return {};
}
