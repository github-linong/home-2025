/**
 * skills.ts — 协作技（E8 / 系统⑨）纯模块：意图构造 + 校验 + 效果数学
 *
 * 纪律（闭合 O-A，呼应 ⑦ 纪律 B）：
 *   - 本模块 **绝不** 直改任何实体 hp/status/iframe/shield/救援/嘲讽状态。
 *   - 只做「纯校验 + 效果数学」并产出 `SkillApplication` 意图结构体；真实落地
 *     （设置 shieldUntilTick / rescueTicks / tauntUntilTick / 冷却）由 world.step 执行，
 *     伤害减免由 combat.resolveDamage 单一出口消费。
 *   - 唯一允许的运行时依赖是 ② 数据基座 types.ts（SKILL_PROTOTYPES / 枚举 / 常量），
 *     与 rescue.ts / enemy-ai.ts 同纪律（不 import combat / dungeon-gen 运行时）。
 *
 * 之所以把「校验 + 数学」与「落地」分离：便于 coop-skill.test.ts 直接对纯函数做单元
 * 验证（含 discipline-B 静态契约：本文件不得含 `hp=` / `status=` 赋值），同时保证
 * 所有状态改变仍收敛到 world.step / combat.resolveDamage 两个单一出口。
 */

import {
  SKILL_IDS,
  SkillTargetMode,
  EntityKind,
  EntityStatus,
  getSkillPrototype,
  type SkillPrototype,
} from "./types.ts";

/** skills.ts 看到的「施法者 / 目标」只读视图（由 world 从 Actor 投影，避免运行时依赖 world）。 */
export interface SkillActorView {
  readonly id: number;
  readonly kind: number; // EntityKindValue
  readonly ownerId?: number;
  readonly status: number; // EntityStatus bitmask
  /** 是否处于断线托管（world 置位；托管期间不可施法）。 */
  readonly disconnected?: boolean;
}

/**
 * SkillApplication —— 技能结算意图结构体（E8 核心产物）。
 * world.step 消费它落地具体效果；任何 hp/status 改变都再经 combat/world，
 * 本模块不持有任何可变状态。
 */
export interface SkillApplication {
  readonly skillId: number;
  readonly casterId: number;
  readonly targetId: number;
  readonly cooldownTicks: number;
  /** >0 → world.step 给 target 设 shieldUntilTick + shieldReduction（combat 消费）。 */
  readonly shieldTicks: number;
  readonly shieldReduction: number;
  /** >0 → world.step 给 target.rescueTicks += 此值（加速倒地盟友救援，非 hp/status）。 */
  readonly rescueBoostTicks: number;
  /** >0 → world.step 给 caster 设 tauntUntilTick（敌人 AI 经 taunt 池优先锁定）。 */
  readonly tauntTicks: number;
}

/** 将原型效果映射为意图结构体（纯函数）。 */
function toApplication(proto: SkillPrototype, casterId: number, targetId: number): SkillApplication {
  return {
    skillId: proto.id,
    casterId,
    targetId,
    cooldownTicks: proto.cooldownTicks,
    shieldTicks: proto.effect.shieldTicks,
    shieldReduction: proto.effect.shieldReduction,
    rescueBoostTicks: proto.effect.rescueBoostTicks,
    tauntTicks: proto.effect.tauntTicks,
  };
}

/**
 * resolveSkillApplication —— 纯校验 + 效果数学：给定施法者 / 目标 / 技能 id，
 * 产出应落地的 SkillApplication，或返回 null（非法目标 / 未知技能 / 托管中）。
 *
 * 校验规则（协作技必须影响「盟友」，非 solo）：
 *   - SELF 模式（TAUNT）：只作用于施法者自身，忽略 target。
 *   - ALLY 模式（SHIELD_ALLY / REVIVE_BOOST）：
 *       · target 必须存在且为 PLAYER；
 *       · 不可指向自己（非 solo）；
 *       · target 不可处于断线托管；
 *       · REVIVE_BOOST 额外要求 target 处于 DOWNED（只救倒地盟友）。
 *
 * @param caster 施法者只读视图。
 * @param target 目标只读视图（ALLY 技能需要；SELF 技能可传 null）。
 * @param skillId 协作技 id（对应 SKILL_IDS）。
 * @param tick 当前权威 tick（预留：未来 castTicks>0 时用于前摇判定；本 Epic 即时落地）。
 * @returns SkillApplication 或 null（应被 world.step 忽略，不进入冷却）。
 */
export function resolveSkillApplication(
  caster: SkillActorView,
  target: SkillActorView | null,
  skillId: number,
  tick: number,
): SkillApplication | null {
  const proto = getSkillPrototype(skillId);
  if (!proto) return null; // 未知技能 id
  // tick 入参预留（未来 castTicks>0 的前摇窗口判定）；当前即时落地，未使用。
  void tick;
  if (caster.disconnected) return null; // 托管中不可施法

  if (proto.targetMode === SkillTargetMode.SELF) {
    // TAUNT：只作用于施法者自身（吸引敌火保护队友，本质是「影响盟友」的协同技）。
    return toApplication(proto, caster.id, caster.id);
  }

  // ALLY 模式：必须指向「其他玩家盟友」。
  if (!target) return null;
  if (target.kind !== EntityKind.PLAYER) return null; // 不能指向敌人 / 资源 / 弹幕
  if (target.id === caster.id) return null; // 不能指向自己（协作技非 solo）
  if (target.disconnected) return null; // 目标托管中不可施技

  if (skillId === SKILL_IDS.REVIVE_BOOST) {
    // 急救链：仅对「倒地」盟友生效（加速救援读条）。
    if ((target.status & EntityStatus.DOWNED) === 0) return null;
  }
  // SHIELD_ALLY：可施于任意（含倒地）玩家盟友（护盾保护）。

  return toApplication(proto, caster.id, target.id);
}
