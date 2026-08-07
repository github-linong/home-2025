/**
 * parry.ts — 格挡判定（E4 落地，服务端权威时间窗）
 * ===========================================================================
 * 纯函数判定「攻击 application_tick 时目标 parryState 是否覆盖」→ 输出减伤/覆盖标志，
 * 由 combat.resolveDamage 在结算时调用（架构 §2：parry 被 combat 调用，无世界回滚）。
 *
 * 纪律 B：parry → 无 combat 运行时依赖，仅经判定协议与 combat 交互（combat 反向下沉调用
 * judgeParry，parry 不反向依赖 combat）。dependency-direction 测试期望 combat → parry
 * 保留一条 type-only 边，故本文件同时被 combat 以类型引用 + 运行时调用两种方式消费。
 */
import { PARRY_TICKS, PARRY_REDUCTION, MIN_TELEGRAPH_TICKS } from "./constants.ts"; // C7 单一来源

/** 格挡判定输入（目标当前 parry 状态）。 */
export interface ParryView {
  readonly active: boolean;
  // = 起始 tick + PARRY_TICKS - 1（含闭区间末 tick；窗口恰含 PARRY_TICKS 个 tick = 250ms）
  readonly windowEndTick: number;
}

/** 格挡判定结果。 */
export interface ParryJudgment {
  readonly covered: boolean; // application_tick 时 parry 窗口是否覆盖
  readonly reduction: number; // 减伤比例 0..1（覆盖时 = PARRY_REDUCTION，否则 0）
}

/**
 * 判定 application_tick 时 parry 是否覆盖（服务端时间窗校验，无回滚）。
 *   covered = active && applicationTick <= windowEndTick
 *   reduction = covered ? PARRY_REDUCTION : 0
 * 窗口跨度为 [起始 tick, windowEndTick] 闭区间，恰 PARRY_TICKS 个 tick（250ms；
 *   windowEndTick = 起始 tick + PARRY_TICKS - 1，见 openParryWindow）。
 */
export function judgeParry(parry: ParryView | undefined, applicationTick: number): ParryJudgment {
  if (!parry || !parry.active) return { covered: false, reduction: 0 };
  const covered = applicationTick <= parry.windowEndTick;
  return { covered, reduction: covered ? PARRY_REDUCTION : 0 };
}

/** 置位 parry 窗口：windowEndTick = tick + PARRY_TICKS - 1（闭区间含末 tick，覆盖 tick .. tick+PARRY_TICKS-1 恰 3 tick = 250ms；配合 combat 在收到 PARRY 输入时调用）。 */
export function openParryWindow(tick: number): ParryView {
  return { active: true, windowEndTick: tick + PARRY_TICKS - 1 };
}

/** 导出量化常量供 combat 复用（避免重复定义，C7）。 */
export const PARRY_TICKS_REF = PARRY_TICKS;
export const MIN_TELEGRAPH_TICKS_REF = MIN_TELEGRAPH_TICKS;

/** 导出量化常量供测试 / 复用（C7 单一来源，实际值来自 constants.ts）。 */
export { PARRY_TICKS, PARRY_REDUCTION } from "./constants.ts";
