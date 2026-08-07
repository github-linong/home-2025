/**
 * inventory.ts — 背包 add + 溢出落地面（E2 · C-Per-3）
 * ===========================================================================
 * 纯函数层（无 IO、无 sim-core 数学依赖，仅引用常量）：
 *   - addItem：背包未满追加；背包满（≥ INVENTORY_CAP）→ 不追加，溢出物品返回（落脚下地面）。
 *   - toGroundLoot：溢出物品 → 地面掉落实体（EntityState.loot），携带 ttlTicks（C-Per-3）。
 *
 * 说明：E2 不实现 combat/spawning/loot/dungeon 具体逻辑。本文件只负责「背包满→地面溢出」
 * 的决策与类型转换；实际在玩家脚下生成 LOOT_GROUND 实体 + TTL 倒计时消失由 E4 落地，
 * 消费方用 toGroundLoot 的返回值即可（无缝衔接，不邮件，ADR 推荐默认③）。
 */

import { INVENTORY_CAP, LOOT_GROUND_TTL_TICKS } from "../sim-core/src/constants.ts"; // C7 单一来源
import type { LootState } from "../sim-core/src/types.ts";
import type { Inventory, InventoryItem } from "./persistence.ts";

/** 背包是否已满（≥ INVENTORY_CAP）。 */
export function isInventoryFull(inv: Inventory): boolean {
  return inv.items.length >= INVENTORY_CAP;
}

/**
 * 加入背包（纯函数，无副作用）。
 * - 未满：返回新背包，overflow=null。
 * - 已满：原背包不变，overflow=该物品（交由调用方落脚下地面，C-Per-3）。
 */
export function addItem(
  inv: Inventory,
  item: InventoryItem,
): { inventory: Inventory; overflow: InventoryItem | null } {
  if (inv.items.length >= INVENTORY_CAP) {
    return { inventory: inv, overflow: item };
  }
  return { inventory: { items: [...inv.items, item] }, overflow: null };
}

/**
 * 溢出物品 → 地面掉落实体（EntityState.loot），携带 ttlTicks（C-Per-3）。
 * 默认 TTL = LOOT_GROUND_TTL_TICKS（150s @12Hz），供客户端倒计时显隐、到期消失。
 */
export function toGroundLoot(item: InventoryItem, ttlTicks: number = LOOT_GROUND_TTL_TICKS): LootState {
  return {
    itemId: item.itemId,
    rarity: item.rarity,
    affixes: item.affixes,
    ttlTicks,
  };
}

/** 导出常量便于调用方统一消费。 */
export { INVENTORY_CAP, LOOT_GROUND_TTL_TICKS };
