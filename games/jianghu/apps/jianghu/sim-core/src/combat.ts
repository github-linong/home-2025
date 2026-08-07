/**
 * combat.ts — 战斗结算（E4 落地，服务端权威）
 * ===========================================================================
 * ⑦ producer：产生「战斗结算结果」作为权威 diff（伤害/状态/格挡结果），由 ① 广播（架构 §2）。
 *
 * 服务端权威（C9 / C11）：
 *   - resolveDamage 完全忽略客户端上报的 req.amount，伤害由服务端按攻击者/技能原型
 *     （baseAmount，由 world 在调用前按原型计算）裁决。伪造高额 amount 被结构性丢弃。
 *   - 格挡减伤由 judgeParry（parry.ts）在服务端时间窗裁定（covered → 伤害 ×(1-PARRY_REDUCTION)）。
 *
 * 依赖白名单（架构 §2）：combat → 依赖 parry(judgeParry 运行时 + ParryJudgment 类型)。
 *   - parry 仅以「类型」被 combat 引用（type-only 引用）满足 dependency-direction 静态契约；
 *   - combat 同时运行时调用 judgeParry（纪律 B 允许：parry 不反向依赖 combat）。
 */
import { PARRY_REDUCTION, SKILL_DAMAGE, SKILL_RANGE, SKILL_CD_BY_SLOT } from "./constants.ts"; // C7 单一来源
import { judgeParry } from "./parry.ts"; // 运行时（纪律 B 允许：combat 调用 parry，parry 不反向依赖 combat）
import type { ParryJudgment, ParryView } from "./parry.ts"; // 仅类型（纪律 B 静态契约：dependency-direction 测试期望此 type 边存在）

/** 伤害结算请求（⑦ 输入）。 */
export interface DamageRequest {
  readonly targetId: number;
  /** 客户端上报 amount（仅遥测，C11 服务端权威重算忽略之）。 */
  readonly amount: number;
  readonly tick: number;
  readonly sourceId?: number;
  /** 服务端权威基础伤害（由攻击者原型/技能原型计算，C11：resolveDamage 仅取此，忽略 amount）。 */
  readonly baseAmount: number;
  /** 目标 parry 视图（用于减伤判定）；敌人目标无格挡 → undefined。 */
  readonly targetParry?: ParryView;
}

/** 伤害结算事件（⑦ 输出，供 ① 广播）。combat 不改 hp（纯函数），由 world 应用 deltaHp。 */
export interface DamageEvent {
  readonly targetId: number;
  readonly deltaHp: number; // 负值=扣血，0=no-op / 被 IFRAME 抵消
  readonly statusChange: number; // 结算后目标 EntityStatus bitmask（本纯函数不管理状态位，返回 0）
  readonly tick: number;
}

/**
 * 权威伤害结算（服务端权威，C9/C11）。
 * - 忽略 req.amount（C11 反作弊：伤害由服务端按 baseAmount 计算）。
 * - 调 judgeParry(targetParry, tick)：covered → deltaHp *= (1 - PARRY_REDUCTION)。
 * - 返回 deltaHp（负=扣血）；world 负责把 deltaHp 应用到 actor.hp。
 */
export function resolveDamage(req: DamageRequest): DamageEvent {
  // C11：服务端权威，忽略客户端上报 amount，仅用 baseAmount。
  const parry = judgeParry(req.targetParry, req.tick);
  const raw = req.baseAmount;
  // GDD：Damage(final) = max(1, ...)。covered → 伤害 ×(1-PARRY_REDUCTION)。
  const dealt = Math.max(1, parry.covered ? Math.round(raw * (1 - PARRY_REDUCTION)) : raw);
  return { targetId: req.targetId, deltaHp: -dealt, statusChange: 0, tick: req.tick };
}

// ─────────────────────────────────────────────────────────────
// 技能（combat §⑥；4 槽，独立 CD）
// ─────────────────────────────────────────────────────────────

/** 技能槽数。 */
export const SKILL_SLOTS = 4;

/** 技能定义（按槽位）。 */
export interface SkillDef {
  readonly slot: number;
  readonly damage: number; // pre-parry 基础伤害
  readonly range: number; // 命中半径（px）
  readonly cdTicks: number; // 冷却（tick）
}

/** 取某槽位技能定义（slot 越界自动归约到 0..3）。 */
export function getSkillDef(slot: number): SkillDef {
  const s = ((slot % SKILL_SLOTS) + SKILL_SLOTS) % SKILL_SLOTS;
  return { slot: s, damage: SKILL_DAMAGE[s], range: SKILL_RANGE, cdTicks: SKILL_CD_BY_SLOT[s] };
}

/** 技能伤害意图（攻击者=玩家、目标=范围内敌人；几何命中由 world 执行）。 */
export interface SkillIntent {
  readonly sourceId: number;
  readonly slot: number;
  readonly damage: number;
  readonly range: number;
  readonly tick: number;
  /** 冷却（tick），供 world 设置 skillCd（C11 服务端权威 CD 闸门）。 */
  readonly cdTicks: number;
}

/** 产出技能伤害意图（纯函数，不含几何；world 据此对范围内敌人 applyDamage）。 */
export function resolveSkill(sourceId: number, slot: number, tick: number): SkillIntent {
  const def = getSkillDef(slot);
  return { sourceId, slot: def.slot, damage: def.damage, range: def.range, tick, cdTicks: def.cdTicks };
}

/** 导出量化常量（避免重复定义，C7）。 */
export const PARRY_REDUCTION_REF = PARRY_REDUCTION;

/** 类型桥接（纪律 B）。 */
export type { ParryJudgment };

/** 导出战斗数值常量（测试 / 复用；C7 单一来源，实际值来自 constants.ts）。 */
export { SKILL_DAMAGE, SKILL_RANGE } from "./constants.ts";
