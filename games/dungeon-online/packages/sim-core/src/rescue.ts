/**
 * rescue.ts — 倒地与救援（E7 / 系统⑪，P1 + P4）
 *
 * 本模块是 ⑪ 的「数据 + 纯决策」基座：持有平衡初稿常量与几何/复活决策纯函数。
 * **不**直接改任何实体 hp/status（纪律 B：hp/status 仅由 combat.resolveDamage 与
 * world.step 持有；本模块只算「该不该」与「该回多少血」，真正落地由 world.step 执行）。
 *
 * 覆盖（S7.1–S7.7）：
 *   - S7.2 救援读条：队友在 RESCUE_RADIUS 内累积 RESCUE_TICKS → 复活；
 *   - S7.2 降级分支：无队友时 SOLO_SELF_RESCUE_TICKS 自动复活（1hp 降级）；
 *   - S7.5 超时：DOWNED_TIMEOUT_TICKS 未救 → OUT（仅超时触发，S7.4 保证伤害不进 OUT）；
 *   - S7.6/S7.7 断线托管：暂停计时 + 抓拍 PersonalState（落地在 world.setDisconnected）。
 *
 * 所有阈值均为 P5 平衡初稿（30Hz → tick 换算见各常量注释）。
 */

import { EntityStatus, EntityKind, type PersonalState } from "./types.ts";

// ============================================================
// E7 平衡初稿常量（P5 调优；30Hz → tick：~3s=90, ~10s=300, ~20s=600）
// ============================================================

/** S7.2 救援触发邻近半径（px）。队友中心距 ≤ 此值才计入救援读条。 */
export const RESCUE_RADIUS = 48;

/** S7.2 救援读条所需 tick（≈3s @30Hz）。需队友持续邻近累积。 */
export const RESCUE_TICKS = 90;

/** S7.2 降级分支：无队友时自动自救所需 tick（≈10s @30Hz），复活为 1hp 降级态。 */
export const SOLO_SELF_RESCUE_TICKS = 300;

/** S7.5 倒地超时 tick（≈20s @30Hz）；超时未救 → 清 DOWNED 置 OUT（本 run 旁观）。 */
export const DOWNED_TIMEOUT_TICKS = 600;

/** S7.2 救援复活回血比例（= max_hp * 此值）。 */
export const REVIVAL_HP_RATIO = 0.3;

/** S7.2 救援复活回血下限（保证最低可行动血量）。 */
export const REVIVAL_HP_MIN = 30;

// ============================================================
// 纯决策视图 + 函数（无副作用）
// ============================================================

/** rescue 需要的实体只读视图（world 的 Actor 结构满足此形状）。 */
export interface RescueActorView {
  readonly id: number;
  readonly kind: number; // EntityKindValue
  readonly x: number;
  readonly y: number;
  readonly status: number;
  /** 是否处于断线托管（world 置位；托管期间不施救）。 */
  readonly disconnected?: boolean;
}

/**
 * withinRescueRadius —— 给定候选救援者中是否有任一处于 RESCUE_RADIUS 内（纯几何）。
 *
 * 候选「有效性」（ALIVE / 非 DOWNED / 非 OUT / 非断线 / 非自身）由 world 预先过滤，
 *   本函数只判定距离。确定性：欧氏距离平方比较，无随机源。
 *
 * @param self 倒地玩家视图。
 * @param candidates 已过滤的有效救援者列表。
 * @returns 是否存在邻近救援者。
 */
export function withinRescueRadius(
  self: RescueActorView,
  candidates: readonly RescueActorView[],
): boolean {
  const r2 = RESCUE_RADIUS * RESCUE_RADIUS;
  for (const o of candidates) {
    const dx = o.x - self.x;
    const dy = o.y - self.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/**
 * revivalHp —— 救援复活应恢复的 hp（P5 初稿：max(max_hp*RATIO, MIN)）。
 * @param maxHp 该玩家最大 hp。
 */
export function revivalHp(maxHp: number): number {
  return Math.max(REVIVAL_HP_MIN, Math.round(maxHp * REVIVAL_HP_RATIO));
}

/**
 * isOutEligibleTarget —— 该玩家是否可被敌人锁定（alive 且未倒地且未出局）。
 * 供 world 在敌人 AI 目标过滤时复用，统一排除 OUT 旁观者（S7.5 后续态）。
 */
export function isOutEligibleTarget(status: number): boolean {
  return (
    (status & EntityStatus.ALIVE) !== 0 &&
    (status & EntityStatus.DOWNED) === 0 &&
    (status & EntityStatus.OUT) === 0
  );
}

/**
 * rescueCandidates —— 从全部 actor 中筛出对某倒地玩家「有效」的救援者（纯过滤）。
 * 条件：其他 PLAYER、ALIVE、非 DOWNED、非 OUT、非断线。
 */
export function rescueCandidates(
  selfId: number,
  actors: readonly RescueActorView[],
): RescueActorView[] {
  const out: RescueActorView[] = [];
  for (const o of actors) {
    if (o.id === selfId) continue;
    if (o.kind !== EntityKind.PLAYER) continue;
    if (!isOutEligibleTarget(o.status)) continue;
    if (o.disconnected) continue;
    out.push(o);
  }
  return out;
}

/**
 * capturePersonalState —— 断线瞬间抓拍（D8 / P4 保底）。
 * 「三者同发」：调用方（world.setDisconnected）在置位 disconnected 的同时调用本函数，
 *   单次持有，不被后续 tick 覆盖。downedRemainingTicks 由当前剩余窗口推算。
 */
export function capturePersonalState(
  seatId: number,
  status: number,
  hp: number,
  downedTicks: number,
  rescueTicks: number,
): PersonalState {
  return {
    seatId,
    status,
    hp,
    downedRemainingTicks: Math.max(0, DOWNED_TIMEOUT_TICKS - downedTicks),
    rescueProgressTicks: rescueTicks,
  };
}
