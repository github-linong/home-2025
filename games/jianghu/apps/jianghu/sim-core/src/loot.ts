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

/** 导出掉落率/词缀数常量（C7 单一来源，供 E4 复用）。 */
export const DROP_RATE_REF = DROP_RATE;
export const AFFIX_COUNTS_REF = AFFIX_COUNTS;
