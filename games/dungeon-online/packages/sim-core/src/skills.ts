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
  CLASS_SKILLS,
  type SkillPrototype,
  type PlayerClass,
} from "./types.ts";

/** skills.ts 看到的「施法者 / 目标」只读视图（由 world 从 Actor 投影，避免运行时依赖 world）。 */
export interface SkillActorView {
  readonly id: number;
  readonly kind: number; // EntityKindValue
  readonly ownerId?: number;
  readonly status: number; // EntityStatus bitmask
  /** 是否处于断线托管（world 置位；托管期间不可施法）。 */
  readonly disconnected?: boolean;
  /** 施法者职业（C4 白名单校验用；legacy/未知 caster 为 undefined → 跳过白名单）。 */
  readonly classId?: PlayerClass;
  /** 世界坐标（DIST-FIX：技能射程校验用；由 world 投影填充，纯只读）。 */
  readonly x?: number;
  readonly y?: number;
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
  /** C4b >0 → world.step 给 target 敌人设 markedUntilTick = world.tick + 此值（combat 消费 ×1.25 易伤）。 */
  readonly markTicks: number;
  /** C4b >0 → world.step 经 resolveDamage 对 target 敌人造成此扁平伤害（SKILL 类，受 D12 门控）。 */
  readonly flatDamage: number;
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
    markTicks: proto.effect.markTicks,
    flatDamage: proto.effect.flatDamage,
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
  allowSelfCast = false,
): SkillApplication | null {
  const proto = getSkillPrototype(skillId);
  if (!proto) return null; // 未知技能 id
  // C4：职业无权施放该技 → 拒绝（world.step 收到 null 会忽略，不进冷却、不落地）。
  if (caster.classId != null) {
    const allowed = CLASS_SKILLS[caster.classId];
    if (!allowed || !allowed.includes(skillId)) return null;
  }
  // tick 入参预留（未来 castTicks>0 的前摇窗口判定）；当前即时落地，未使用。
  void tick;
  if (caster.disconnected) return null; // 托管中不可施法

  if (proto.targetMode === SkillTargetMode.SELF) {
    // TAUNT：只作用于施法者自身（吸引敌火保护队友，本质是「影响盟友」的协同技）。
    return toApplication(proto, caster.id, caster.id);
  }

  // DIST-FIX：技能射程校验（range>0 且双方坐标可见时）。超距 → 拒绝（防全图施放）。
  // SELF 模式 range=0 不限距离；ALLY/ENEMY 模式由 prototype.range 约束。
  if (
    proto.range > 0 &&
    caster.x != null &&
    caster.y != null &&
    target &&
    target.x != null &&
    target.y != null
  ) {
    const dx = target.x - caster.x;
    const dy = target.y - caster.y;
    if (dx * dx + dy * dy > proto.range * proto.range) return null;
  }

  // ENEMY 模式（C4b 进攻技 MARK/BARRAGE）：目标必须是「敌人」（ENEMY 或 BOSS），
  // 不可指向玩家/资源/弹幕/自己；纯状态/伤害效果由 world.step / combat 落地（discipline B）。
  if (proto.targetMode === SkillTargetMode.ENEMY) {
    if (!target) return null;
    if (target.kind !== EntityKind.ENEMY && target.kind !== EntityKind.BOSS) return null;
    return toApplication(proto, caster.id, target.id);
  }

  // ALLY 模式：必须指向「其他玩家盟友」。
  if (!target) return null;
  if (target.kind !== EntityKind.PLAYER) return null; // 不能指向敌人 / 资源 / 弹幕
  // SOLO-SELF-FALLBACK：无其他玩家（单机割草）时，允许对自身施放护盾 ——
  // 参考吸血鬼幸存者等 solo 割草游戏：技能必须"按了有反馈"，护盾自保而非指向空盟友。
  // allowSelfCast 由 world.step 在检测到 solo 环境时传入；非 solo（联机）仍禁止 self-cast。
  if (target.id === caster.id) {
    if (!allowSelfCast) return null;
    if (skillId !== SKILL_IDS.SHIELD_ALLY) return null; // 仅护盾支持 solo 自保（急救需要倒地队友）
  }
  if (target.disconnected) return null; // 目标托管中不可施技

  if (skillId === SKILL_IDS.REVIVE_BOOST) {
    // 急救链：仅对「倒地」盟友生效（加速救援读条）。
    if ((target.status & EntityStatus.DOWNED) === 0) return null;
  }
  // SHIELD_ALLY：可施于任意（含倒地）玩家盟友（护盾保护）。

  return toApplication(proto, caster.id, target.id);
}
