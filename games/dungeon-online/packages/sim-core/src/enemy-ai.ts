/**
 * enemy-ai.ts — 敌人与 AI（E6 / 系统⑧）
 *
 * 本模块是 ⑧ 的唯一 AI 来源：每个 tick 为单个敌人产出**意图对象**（EnemyIntent），
 * 绝不直改任何实体状态。world（① 编排层）消费意图并翻译为权威模拟：
 *   - MOVE   → world 按 ENEMY_PROTOTYPES[enemyTypeId].speed / 30 更新敌人坐标；
 *   - ATTACK → world 经 combat.resolveDamage（D12 telegraph 前摇）结算伤害。
 *
 * 纪律 B（关键）：本模块只 `import type`（类型）＋只读 ② 原型数据（ENEMY_PROTOTYPES，
 *   属数据基座 types.ts，**非** combat/dungeon-gen 运行时）。**绝不**运行时 import
 *   combat.ts / dungeon-gen.ts，也**绝不**直改实体 hp/status。伤害唯一出口是 ⑦
 *   resolveDamage（由 world 调用）。combat.test.ts 第 6 例静态契约守此门。
 */

import { ENEMY_PROTOTYPES } from "./types.ts";
import type { Vec2 } from "./types.ts";

/** 敌人 AI 产出的意图（普通对象；world 据此翻译，不直改实体）。 */
export type EnemyIntent =
  | { readonly type: "MOVE"; readonly dir: Vec2 }
  | { readonly type: "ATTACK"; readonly targetId: number; readonly damage: number };

/** stepEnemyAi 看到的「自身」只读视图（由 world 从 Actor 投影，避免运行时依赖 world）。 */
export interface EnemyAiSelf {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly enemyTypeId: string;
}

/** stepEnemyAi 看到的「玩家」只读视图（alive = ALIVE 且非 DOWNED）。 */
export interface EnemyAiPlayer {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
  /**
   * ⑨ E8 TAUNT：该玩家是否正处于嘲讽窗口（由 world.step 设置 tauntUntilTick 后投影）。
   * 若有任意嘲讽中的玩家，敌人只在其范围内选最近目标（吸引敌火、保护其他队友）。
   * 纯只读标志，不影响本模块「不直改状态」的纪律（仅改变目标选择）。
   */
  readonly taunt?: boolean;
}

/** stepEnemyAi 的调用上下文（tick + 当前存活玩家视图）。 */
export interface EnemyAiContext {
  readonly tick: number;
  readonly players: readonly EnemyAiPlayer[];
}

/**
 * stepEnemyAi — 为单个敌人产出本 tick 意图。
 *
 * @param self 敌人自身只读视图（含 enemyTypeId 以查原型）。
 * @param ctx  调用上下文（tick + 存活玩家列表）。
 * @returns EnemyIntent：
 *   - MOVE   （朝最近存活玩家，单位方向；world 按 speed/30 施加位移）
 *   - ATTACK （在攻击范围内，携带 targetId + 原型伤害 enemyDamage）
 *
 * 确定性：仅依赖 self/ctx/原型数据，无 Math.random / Date；最近玩家取确定性
 * 「首个最小欧氏距离平方」（数组序稳定）。纪律 B：不 import combat/dungeon-gen、
 * 不直改 hp/status，只产出意图。
 */
export function stepEnemyAi(self: EnemyAiSelf, ctx: EnemyAiContext): EnemyIntent {
  const proto = ENEMY_PROTOTYPES[self.enemyTypeId];

  // ⑨ E8 TAUNT：若有任意嘲讽中的玩家，敌人只在其范围内选最近目标（吸引敌火）。
  // 否则退回默认「最近存活玩家」。确定性：按输入序，首个最小欧氏距离平方；无随机源。
  const taunters = ctx.players.filter((p) => p.taunt === true);
  const pool = taunters.length > 0 ? taunters : ctx.players;

  // 最近存活玩家（确定性：按输入序，首个最小欧氏距离平方）。
  let nearest: EnemyAiPlayer | null = null;
  let bestSq = Infinity;
  for (const p of pool) {
    if (!p.alive) continue;
    const dx = p.x - self.x;
    const dy = p.y - self.y;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestSq) {
      bestSq = dSq;
      nearest = p;
    }
  }

  // 无存活玩家 → 静止（避免乱走；world 据此不位移）。
  if (!nearest) {
    return { type: "MOVE", dir: { x: 0, y: 0 } };
  }

  const dist = Math.sqrt(bestSq);
  if (dist <= proto.attackRange) {
    // 在攻击范围内 → 发起攻击意图（伤害取原型平衡初稿值，非玩家 18）。
    return { type: "ATTACK", targetId: nearest.id, damage: proto.attackDamage };
  }

  // caster_ember 远程风筝：太近则后撤拉开射程，否则靠近维持射程（确定性，无随机源）。
  // 其余敌人（grunt/elite_warden/boss）维持原「朝最近玩家移动」行为，绝不变更。
  if (self.enemyTypeId === "caster_ember") {
    const retreatThreshold = proto.attackRange * 0.55; // 贴脸阈值：< 此距离后撤
    if (dist < retreatThreshold) {
      // 远离目标：单位方向 = (self − target) 归一化（后撤，位移由 world 按 speed/30 施加）。
      const dx = self.x - nearest.x;
      const dy = self.y - nearest.y;
      const len = Math.hypot(dx, dy) || 1;
      return { type: "MOVE", dir: { x: dx / len, y: dy / len } };
    }
  }

  // 否则朝最近玩家移动（归一化单位方向；位移由 world 按 speed/30 施加）。
  const dx = nearest.x - self.x;
  const dy = nearest.y - self.y;
  const len = Math.hypot(dx, dy) || 1;
  return { type: "MOVE", dir: { x: dx / len, y: dy / len } };
}
