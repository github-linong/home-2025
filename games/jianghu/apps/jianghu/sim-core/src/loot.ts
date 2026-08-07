/**
 * loot.ts — 掉落（E4 落地）
 * ===========================================================================
 * 副本内刷怪/掉装均复用传入的 Rng 实例 seed 流（splitmix64/Xoshiro，D9），保证可复现/可审计。
 *
 * 依赖白名单（架构 §2）：loot → 依赖 rng(实例 seed 流) + constants(单一来源)。不依赖 spawning / combat。
 *
 * 稀有度索引（与 EntityState.LootState.rarity / InventoryItem.rarity 对齐）：
 *   0=白(white) / 1=蓝(blue) / 2=金(gold) / 3=暗金(darkgold)
 */
import { Rng } from "./rng.ts";
import {
  DROP_RATE,
  AFFIX_COUNTS,
  LOOT_GROUND_TTL_TICKS,
  RARITY_NAMES,
  RARITY_WEIGHTS_BY_TIER,
  AFFIX_ID_MAX,
  CHEST_ITEM_COUNT_MIN, // E20：开箱件数区间下界（C7 单一来源）
  CHEST_ITEM_COUNT_MAX, // E20：开箱件数区间上界（C7 单一来源）
  type EnemyTier,
} from "./constants.ts"; // C7 单一来源
import type { LootState } from "./types.ts";

/** 单次掉落结果。rarity 为索引（0=白/1=蓝/2=金/3=暗金）。 */
export interface LootResult {
  readonly itemId: number;
  readonly rarity: number; // 0=白 1=蓝 2=金 3=暗金（与 EntityState.LootState / InventoryItem 对齐）
  readonly affixes: number[]; // 词缀 id 列表（数量由 AFFIX_COUNTS 决定）
}

/** 按 tier 掷稀有度索引（权重见 RARITY_WEIGHTS_BY_TIER，loot §⑥）。 */
function rollRarityIndex(rng: Rng, tier: EnemyTier): number {
  const weights = RARITY_WEIGHTS_BY_TIER[tier];
  const total = weights.reduce<number>((a, b) => a + b, 0);
  let r = rng.nextFloat() * total;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return weights.length - 1;
}

/** 按稀有度掷词缀数（落在区间 [AFFIX_COUNTS[rarity][0], AFFIX_COUNTS[rarity][1]]）。 */
function rollAffixCount(rng: Rng, rarityIdx: number): number {
  const range = AFFIX_COUNTS[RARITY_NAMES[rarityIdx]];
  return rng.nextInt(range[0], range[1]);
}

/**
 * 掷骰掉落（确定性，复用传入的实例 seed Rng 流）。
 * - 命中：rng.nextFloat() < DROP_RATE[tier]（normal 0.3；elite/boss 1.0）；未命中 → null。
 * - 命中 → 掷稀有度（权重 白>蓝>金>暗金，比例取 GDD §⑥）→ 掷词缀数（AFFIX_COUNTS 区间）
 *   → 生成词缀 id 数组（rng 选 1..AFFIX_ID_MAX）→ itemId = rng。
 * 返回 LootResult{itemId, rarity, affixes}。
 */
export function rollLoot(rng: Rng, tier: EnemyTier): LootResult | null {
  // 命中判定（C11 服务端权威掷骰，非客户端决定）。
  if (rng.nextFloat() >= DROP_RATE[tier]) return null;
  const rarityIdx = rollRarityIndex(rng, tier);
  const count = rollAffixCount(rng, rarityIdx);
  const affixes: number[] = [];
  for (let i = 0; i < count; i++) affixes.push(rng.nextInt(1, AFFIX_ID_MAX));
  const itemId = rng.nextInt(1, 0x7fffffff);
  return { itemId, rarity: rarityIdx, affixes };
}

/**
 * 生成落地掉落（含 ttlTicks = LOOT_GROUND_TTL_TICKS）供 world 掉装。
 * 保证产出一个 LootState：若 rng 本次未命中（仅 normal 可能），循环重试至命中（兜底白装），
 * 重试有上限且确定性（同 rng 流结果确定）。
 */
export function dropToGround(rng: Rng, tier: EnemyTier): LootState {
  let res = rollLoot(rng, tier);
  let guard = 0;
  while (res === null && guard < 16) {
    res = rollLoot(rng, tier);
    guard += 1;
  }
  if (res === null) {
    // 极端兜底（normal 0.3 连续未命中的 1e-8 级情形）：保证至少一个白装，确定性。
    res = { itemId: rng.nextInt(1, 0x7fffffff), rarity: 0, affixes: [] };
  }
  return {
    itemId: res.itemId,
    rarity: res.rarity,
    affixes: res.affixes,
    ttlTicks: LOOT_GROUND_TTL_TICKS,
  };
}

/**
 * E20：强制产出暗金（rarity=3）。
 * 掷 boss 掉落（权重 金55/暗金45）直至暗金；guard 上限兜底直接构造（暗金恒 5 词缀）。
 * 确定性：同 rng 流 ⇒ 同结果（重试次数由 rng 决定，结果确定，D9）。
 * 用于：① 宝箱实体「显示暗金」（BOSS 死亡刷宝箱时预掷，向玩家预告必含暗金）；
 * ② 开箱结算第 1 件（必含暗金）。
 */
export function rollGuaranteedDarkgold(rng: Rng): LootResult {
  let res = rollLoot(rng, "boss");
  let guard = 0;
  while (res !== null && res.rarity !== 3 && guard < 16) {
    res = rollLoot(rng, "boss");
    guard += 1;
  }
  if (res === null || res.rarity !== 3) {
    // 极端兜底（确定性）：暗金 AFFIX_COUNTS.darkgold=[5,5] 恒 5 词缀 + 随机 itemId。
    const affixes: number[] = [];
    const count = AFFIX_COUNTS.darkgold[0];
    for (let i = 0; i < count; i++) affixes.push(rng.nextInt(1, AFFIX_ID_MAX));
    res = { itemId: rng.nextInt(1, 0x7fffffff), rarity: 3, affixes };
  }
  return res;
}

/**
 * E20：强制产出金/蓝（rarity ∈ {1,2}，开箱非暗金件）。
 * 掷 elite 掉落（权重 蓝40/金45/暗金15）直至非暗金；guard 上限兜底直接构造（蓝/金随机）。
 * 确定性：同 rng 流 ⇒ 同结果（D9）。
 */
export function rollGoldOrBlue(rng: Rng): LootResult {
  let res = rollLoot(rng, "elite");
  let guard = 0;
  while (res !== null && res.rarity === 3 && guard < 16) {
    res = rollLoot(rng, "elite");
    guard += 1;
  }
  if (res === null || res.rarity === 3) {
    const rarityIdx = rng.nextFloat() < 0.5 ? 1 : 2; // 蓝 / 金
    const range = AFFIX_COUNTS[RARITY_NAMES[rarityIdx]];
    const count = rng.nextInt(range[0], range[1]);
    const affixes: number[] = [];
    for (let i = 0; i < count; i++) affixes.push(rng.nextInt(1, AFFIX_ID_MAX));
    res = { itemId: rng.nextInt(1, 0x7fffffff), rarity: rarityIdx, affixes };
  }
  return res;
}

/**
 * E20：宝箱开箱结算 —— 3-5 件装备：第 1 件必含暗金（rarity=3）+ 其余金/蓝（rarity∈{1,2}）。
 * 确定性（D9）：同 rng 流 ⇒ 同内容序列；消费 Rng 流发生在**开箱 tick**（非 BOSS 死亡 tick）。
 * 件数区间 CHEST_ITEM_COUNT_MIN/MAX（C7 单一来源）。
 */
export function rollChestContents(rng: Rng): LootResult[] {
  const count = rng.nextInt(CHEST_ITEM_COUNT_MIN, CHEST_ITEM_COUNT_MAX);
  const items: LootResult[] = [rollGuaranteedDarkgold(rng)];
  for (let i = 1; i < count; i++) items.push(rollGoldOrBlue(rng));
  return items;
}

/** 导出掉落率/词缀数常量（C7 单一来源，供 E4 复用）。 */
export const DROP_RATE_REF = DROP_RATE;
export const AFFIX_COUNTS_REF = AFFIX_COUNTS;
