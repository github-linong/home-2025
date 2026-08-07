/**
 * spawning.ts — 刷怪（E4 落地，确定性实例化）
 * ===========================================================================
 * 依据简单刷怪配置 SpawnZone[] 实例化敌人（确定性，复用传入的 Rng 实例 seed 流）。
 *
 * 纪律（C6）：
 *   - spawning → **不运行时依赖 loot**（仅以 type-only 引用掉落结果类型）。
 *   - spawning → 不依赖 dungeonGen（E5）；本 epic 用自定的 SpawnZone，不复用 dungeonGen 输出。
 *   - 所有随机走传入的 Rng 实例（同 seed + 同 zone ⇒ 同敌人集/同 HP，D9）。
 */
import { EntityKind } from "./types.ts"; // 值（BOSS/ENEMY 判定）
import type { SpawnPoint, Vec2 } from "./types.ts"; // 类型（SpawnPoint 来自 types，dungeonGen 产出；本文件仅自定 SpawnZone）
import type { LootResult } from "./loot.ts"; // 仅类型（纪律：不运行时依赖 loot）
import { Rng } from "./rng.ts"; // 确定性 Rng 实例（seed 流）
import {
  HP_MULT,
  ENEMY_BASE_HP,
  ENEMY_BASE_ATK,
  SPAWN_SCATTER_PX,
  DEFAULT_RESPAWN_TICKS,
  type EnemyTier,
} from "./constants.ts"; // C7 单一来源

/** 数值 tier（0/1/2）→ HP_MULT / RARITY 键（字符串），避免 `HP_MULT[0]` 误取 undefined。 */
const TIER_KEYS: readonly EnemyTier[] = ["normal", "elite", "boss"];

/**
 * 简单刷怪区（E4 联调用，不依赖 dungeonGen/E5）。
 * tier: 0=normal / 1=elite / 2=boss；count 为该区实例敌人数量；respawnTicks 为清空后复活间隔。
 * 形状刻意轻量（pos/tier/enemyTypeId/count/respawnTicks），覆盖 spawning §③ 核心字段。
 */
export interface SpawnZone {
  readonly pos: Vec2;
  readonly tier: 0 | 1 | 2;
  readonly enemyTypeId: string;
  readonly count: number;
  readonly respawnTicks?: number;
}

/** 单个被实例化敌人的规格（id 由 world 统一分配，避免 spawning 触碰世界状态）。 */
export interface SpawnedEnemySpec {
  readonly kind: number; // EntityKind.ENEMY 或 BOSS
  readonly pos: Vec2;
  readonly hp: number;
  readonly maxHp: number;
  readonly tier: number; // 0/1/2
  readonly atk: number; // 接触伤害基础
}

/** 刷怪波次实例结果。 */
export interface SpawnResult {
  readonly spawned: number;
  readonly enemies: readonly SpawnedEnemySpec[];
  readonly lootPreview: readonly LootResult[]; // 仅类型桥接，掉装由 world 在死亡时经 loot.rollLoot
}

/**
 * 依 SpawnZone[] 实例化敌人（确定性，复用传入 Rng 实例 seed 流）。
 * - kind = tier===2 ? BOSS : ENEMY
 * - hp  = ENEMY_BASE_HP * HP_MULT[tier]（精英×3 / BOSS×10）
 * - atk = ENEMY_BASE_ATK * HP_MULT[tier]
 * - pos 在刷怪点附近确定性散布（±SPAWN_SCATTER_PX）
 * 同 seed + 同 zone ⇒ 同敌人集 / 同 HP / 同散布（D9）。
 */
export function spawnWave(zones: readonly SpawnZone[], rng: Rng): SpawnResult {
  const enemies: SpawnedEnemySpec[] = [];
  for (const z of zones) {
    const tierKey: EnemyTier = TIER_KEYS[z.tier];
    const mult = HP_MULT[tierKey];
    const maxHp = ENEMY_BASE_HP * mult;
    const atk = ENEMY_BASE_ATK * mult;
    const kind = z.tier === 2 ? EntityKind.BOSS : EntityKind.ENEMY;
    for (let i = 0; i < z.count; i++) {
      const ox = rng.nextInt(-SPAWN_SCATTER_PX, SPAWN_SCATTER_PX);
      const oy = rng.nextInt(-SPAWN_SCATTER_PX, SPAWN_SCATTER_PX);
      enemies.push({
        kind,
        pos: { x: z.pos.x + ox, y: z.pos.y + oy },
        hp: maxHp,
        maxHp,
        tier: z.tier,
        atk,
      });
    }
  }
  return { spawned: enemies.length, enemies, lootPreview: [] };
}

/**
 * 复活计时：敌人死亡于 deathTick，从同 zone 复活于 deathTick + (respawnTicks ?? 默认)。
 * 纯函数，确定性（world 持有 zone 状态并据此调度重生，D9）。
 */
export function nextRespawnTick(deathTick: number, zone: SpawnZone): number {
  return deathTick + (zone.respawnTicks ?? DEFAULT_RESPAWN_TICKS);
}
