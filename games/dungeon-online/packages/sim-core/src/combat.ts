/**
 * combat.ts — 战斗结算核心（E5 / 系统⑦，权威伤害真相源 / producer）
 *
 * 本模块是 ① 编排层之外的「唯一伤害结算权威」（ADR-NET-01 D13）：
 *   - 客户端 / ⑧ enemy-ai 只提交 DamageRequest（意图），**绝不**直接改实体 hp/status。
 *   - resolveDamage 是纯函数：吃当前战斗态 + 请求，改目标实体 hp/status，返回 DamageEvent。
 *
 * 纪律（C11 / D12 / D13）：
 *   - C11 反作弊：req.amount 被 **完全忽略**，伤害由服务端 PLAYER_ATTACK_DAMAGE 裁决；
 *     客户端上报的 amount 再大也只作日志/调试，不进入结算。
 *   - D12 telegraph：源实体存在未完成的 windup（telegraph.applyTick > state.tick）时，
 *     本次请求为 no-op（伤害尚未前摇完成），返回 deltaHp=0。
 *   - DODGE（kind=2）：不直接造成损伤，而是给目标（即来源自身）授予 IFRAME 免伤窗口；
 *     落入该窗口的命中被完全抵消。
 *   - hp 降至 ≤0 → 置 DOWNED 位并钳制 hp=0（倒地恢复 / OUT 由 ⑪ E7 接管，此处仅触发）。
 *   - S7.4 倒地/出局免疫：target 已带 DOWNED 或 OUT 位 → 直接 no-op 返回
 *     （deltaHp=0，statusChange=当前 status）。敌人无法「补刀」倒地玩家；OUT 只由
 *     超时（⑪ E7.S7.5）触发，绝不经伤害进入。
 *
 * 纪律 B（关键）：本模块 **只** 被 world（① 编排）与 ⑧ enemy-ai 调用；
 *   自身不 import dungeon-gen / enemy-ai 运行时，保持结算单点。
 */

import type { DamageRequest, DamageEvent } from "./types.ts";
import { EntityStatus } from "./types.ts";

// 战斗相关类型从 ② schema 基座（types.ts）统一导出，便于 ⑦ 调用方单点引用。
export type { DamageRequest, DamageEvent } from "./types.ts";

/** ADR D12：telegraph 前摇最小 tick 数（0.6s @30Hz）。伤害在 windup 完成前为 no-op。 */
export const MIN_TELEGRAPH_TICKS = 18;

/** C11：玩家普攻伤害完全服务端裁决（忽略客户端传入 amount）。
 * BAL-FIX 2026-08-11：18 → 26（+44%），解决「人太弱」——原 18/0.6s≈30DPS 单体，
 * 面对 6-12 只/波清场过慢；26/0.6s≈43DPS 与 grunt 40HP 约 2 刀、精英 150 约 6 刀匹配。 */
export const PLAYER_ATTACK_DAMAGE = 38;

/** 玩家普攻射程（px，DIST-FIX 2026-08-11；RANGE-BALANCE 2026-08-12 90→130）。
 * 之前玩家 ATTACK 目标完全由客户端指定且无距离校验 → 可隔全图锁头攻击（破坏走位/风筝玩法）。
 * 参照割草游戏（Vampire Survivors/暗黑）近战射程：130px ≈ 4 tiles，显著长于近战怪物攻击范围
 * （grunt 40 / brute 48 / elite 64），并匹配远程怪下调后的射程（caster 120 / gunner 110）——
 * 解决「怪物攻击范围远大于人物」的不对称。
 * 攻击判定在 telegraph 启动时校验（world.step）：超出射程的目标 → 本次 ATTACK no-op（不启动前摇）。 */
export const PLAYER_ATTACK_RANGE = 130;

/** KNOCKBACK（P0-1 2026-08-12）：玩家近战命中敌人施加击退的硬直时长（tick，@30Hz ≈0.13s）。
 *  位移速度在 world.step 击退消费处定义（130px/s）；boss 位移减半。 */
export const KNOCKBACK_TICKS = 4;

/** BOSS-MULTI-SKILL（P2 2026-08-12）：火焰新星参数（参考 Hades boss 模式化技能）。
 *  INTERVAL 50 tick ≈1.7s 一次；RADIUS 130px（≈普攻范围 2x，需走位躲）；TELEGRAPH 25 tick ≈0.83s 预警。 */
export const BOSS_NOVA_INTERVAL = 50;
export const BOSS_NOVA_RADIUS = 130;
export const BOSS_NOVA_TELEGRAPH = 25;

/** 玩家普攻命中扇形半角（rad，RANGE-BALANCE 2026-08-12）。
 * 玩家近战从「单体锁定」改为「前向扇形 AOE」：命中朝向方向 ±PLAYER_ATTACK_CONE_RAD 内、
 * 距离 ≤ PLAYER_ATTACK_RANGE 的所有敌人（参考暗黑/VS 近战 AOE，割草清屏核心爽感）。
 * 注意：方向来自 telegraph 启动时的朝向（客户端 aimDir / 移动方向）。 */
export const PLAYER_ATTACK_CONE_RAD = Math.PI / 3; // 60° 半角 → 120° 扇形

/** DODGE 授予的 IFRAME 免伤窗口（tick，~0.4s @30Hz）。 */
export const DODGE_IFRAME_TICKS = 12;

/** 战斗意图种类（对齐 InputAction.ATTACK/DODGE/SKILL；MOVE/SIGNAL 不进结算）。
 *  PROJECTILE(4)：M16 飞行弹道命中结算（经 world.step 弹道碰撞调用 ⑦）；非 DODGE，
 *  走普通伤害路径（自动尊重 IFRAME/DODGE 免伤，C11 服务端裁决）。仅 M16 新增弹道使用。 */
export const CombatKind = {
  ATTACK: 1,
  DODGE: 2,
  SKILL: 3,
  PROJECTILE: 4,
} as const;
export type CombatKindValue = (typeof CombatKind)[keyof typeof CombatKind];

/** 攻击前摇运行时状态（随源实体携带；resolveDamage 读取以强制 windup，D12）。 */
export interface AttackWindup {
  readonly startTick: number;
  readonly applyTick: number;
  readonly targetId: number;
  readonly kind: number;
  /** 攻击朝向单位向量（RANGE-BALANCE 2026-08-12：玩家近战扇形 AOE 结算方向）。
   *  玩家 telegraph 启动时由 cmd.dir（aimDir/移动方向）记录；敌人无需（保持单体命中 targetId）。 */
  dir?: { readonly x: number; readonly y: number };
  /** BOSS-MULTI-SKILL（P2）：火焰新星 AOE 半径（px）。boss 周期性以自身为中心爆火圈；
   *  结算时若 novaRadius 非空 → 对该半径内所有 ALIVE 玩家结算（复用 bomber AOE 模式）。 */
  novaRadius?: number;
}

/**
 * combat 操作的实体视图（world 的 Actor 结构满足此形状：hp/status/iframeUntilTick 可变）。
 * 通过入参传入 `entities: Map<id, CombatEntity>`，resolveDamage 据此改目标状态。
 */
export interface CombatEntity {
  readonly id: number;
  hp: number;
  maxHp: number;
  status: number;
  /** 进行中的攻击前摇（D12）；null/undefined = 无 windup。 */
  telegraph?: AttackWindup | null;
  /** dodge 免伤窗口截止 tick；state.tick <= 此值时该实体免疫伤害（DODGE 生效）。 */
  iframeUntilTick?: number;
  /**
   * ⑨ E8 SHIELD_ALLY 减伤护盾窗口截止 tick（由 world.step 经技能意图设置）。
   * state.tick <= 此值且 shieldReduction>0 时，本次伤害按 (1 - shieldReduction) 减免。
   * 未设置 / 已过期 → 不影响结算（确定性 intact，golden 场景永不触发本分支）。
   */
  shieldUntilTick?: number;
  /** SHIELD_ALLY 减伤比例 0..1（由 world.step 设置；combat 单一出口消费）。 */
  shieldReduction?: number;
  /** G1 升级：来源（玩家）等级。>1 时普攻伤害 + (level-1)*2（击杀得经验 → 升级变强）。
   *  由 world 传参（CombatEntity 视图含 level）；未设置/==1 → 恒 PLAYER_ATTACK_DAMAGE（golden 无损）。 */
  level?: number;
  /** 拾取 buff 临时攻击增幅窗口截止 tick（world.step 经拾取设置，combat 消费）。 */
  buffUntilTick?: number;
  /** 临时攻击 buff 倍率（>1，如 1.2=+20%；由 world.step 设置；combat 单一出口消费）。 */
  buffMult?: number;
  /**
   * C4b 猎手标记易伤窗口截止 tick（由 world.step 经 MARK 技能意图设置，仅敌人持有）。
   * state.tick <= 此值（即 markedUntilTick > state.tick，二者等价）时，本次对该敌伤害 ×1.25。
   * 未设置 / 已过期 → 不影响结算（确定性 intact，golden 场景永不触发本分支）。
   */
  markedUntilTick?: number;
  /** S2 perk：伤害加成倍率（>1，如 1.15）。world.step 经 applyPerk 设置，combat 单一出口消费。 */
  perkDamageMult?: number;
}

/** resolveDamage 的权威战斗态快照（每 tick 由 world 组装传入）。 */
export interface CombatState {
  readonly tick: number;
  readonly entities: ReadonlyMap<number, CombatEntity>;
}

/**
 * resolveDamage —— 系统⑦ 唯一权威伤害结算（纯函数）。
 *
 * @param state 当前权威战斗态（tick + 实体 Map）。
 * @param req 伤害请求（意图）。`req.amount` 被忽略（C11）。
 * @returns DamageEvent（targetId / deltaHp / statusChange / tick）。
 */
export function resolveDamage(state: CombatState, req: DamageRequest): DamageEvent {
  const target = state.entities.get(req.targetId);
  const source = state.entities.get(req.sourceId);
  if (!target) {
    return { targetId: req.targetId, deltaHp: 0, statusChange: 0, tick: state.tick };
  }

  // DODGE：授予来源自身 IFRAME 免伤窗口；不直接造成损伤。
  if (req.kind === CombatKind.DODGE) {
    const ent = source ?? target;
    ent.iframeUntilTick = state.tick + DODGE_IFRAME_TICKS;
    ent.status |= EntityStatus.IFRAME;
    return {
      targetId: ent.id,
      deltaHp: 0,
      statusChange: ent.status,
      tick: state.tick,
    };
  }

  // D12 windup 未完成 → no-op（伤害尚未前摇完成）。
  // 例外（M16）：PROJECTILE(4) 为已发射、独立飞行的弹道伤害——伤害在「命中时」才经 ⑦ 结算，
  //   其前摇已于发射者 applyTick 完成，不受发射者「下一次攻击」前摇门控；否则飞行弹道会被发射者
  //   立即重启的前摇误杀（gunner 在 applyTick 后立刻起新 telegraph → 弹道命中时 source.telegraph
  //   仍存在 → 被误判为 windup 未完成 → no-op）。PROJECTILE 绕过此门，ATTACK/SKILL 仍受其约束。
  if (
    req.kind !== CombatKind.PROJECTILE &&
    source?.telegraph &&
    source.telegraph.applyTick > state.tick
  ) {
    return { targetId: req.targetId, deltaHp: 0, statusChange: target.status, tick: state.tick };
  }

  // IFRAME 免伤：命中处于免伤窗口的目标 → 完全抵消（DODGE 生效）。
  if (target.iframeUntilTick != null && state.tick <= target.iframeUntilTick) {
    return { targetId: req.targetId, deltaHp: 0, statusChange: target.status, tick: state.tick };
  }

  // S7.4 倒地/出局免疫（⑪ E7）：已倒地/出局的目标不再受任何伤害结算影响。
  // 防「补刀」：敌人只锁定 ALIVE&!DOWNED，故正常路径不会命中倒地玩家，本分支为防御性
  // 兜底（如过期 telegraph 仍指向倒地目标）。OUT 只能由超时触发，绝不经此处进入。
  // 返回 no-op：hp/status 不变，statusChange 回传当前 status 以维持快照确定性。
  if ((target.status & (EntityStatus.DOWNED | EntityStatus.OUT)) !== 0) {
    return { targetId: req.targetId, deltaHp: 0, statusChange: target.status, tick: state.tick };
  }

  // C11：玩家攻击服务端裁决伤害，忽略 req.amount（恒 PLAYER_ATTACK_DAMAGE）。
  // E6：敌人攻击取 world 经意图提交的 enemyDamage（来自 ENEMY_PROTOTYPES 平衡初稿），
  //     同样由服务端裁决，客户端不可注入（enemyDamage 只可能由 ① 编排层设置）。
  let dmgBase = req.enemyDamage != null ? req.enemyDamage : PLAYER_ATTACK_DAMAGE;
  // G1 升级伤害加成：玩家等级 >1 时，普攻伤害 + (level-1)*2（击杀得经验 → 升级越打越疼）。
  // 由 world 在 CombatEntity 视图传 level；未设置/==1 → 恒 base（golden 场景无损）。
  if (source?.level != null && source.level > 1 && req.enemyDamage == null) {
    dmgBase += (source.level - 1) * 3; // SLAUGHTER-FIX: +2→+3/级
  }
  // 来源攻击 buff（拾取 buff 后临时增幅；world 经拾取设置 buffUntilTick/buffMult，
  // 仍由本函数单一出口落地，skills 模块绝不直改 hp，discipline B）。
  // 未设置 / 已过期 → dmgBase 原样结算（golden 场景此分支恒不触发）。
  let dmg = dmgBase;
  if (
    source?.buffUntilTick != null &&
    source.buffUntilTick > 0 &&
    state.tick <= source.buffUntilTick &&
    source.buffMult != null &&
    source.buffMult > 0
  ) {
    dmg = Math.round(dmg * source.buffMult);
  }
  // S2 perk 伤害加成：玩家选择「伤害」perk 后，其所有攻击伤害 ×perkDamageMult（>1）。
  // 由 world.step 经 applyPerk 设置；仍由本函数（唯一 hp 结算出口）落地。
  // 未选 perk → 本分支恒不触发（golden 场景无损）。
  if (source?.perkDamageMult != null && source.perkDamageMult > 0) {
    dmg = Math.round(dmg * source.perkDamageMult);
  }
  // ⑨ E8 SHIELD_ALLY 减伤：目标处于护盾窗口且带减伤比例 → 按比例减免。
  // 仍由本函数（唯一 hp 结算出口）落地，skills 模块绝不直改 hp（discipline B）。
  // 未设置护盾 / 已过期 → dmgBase 原样结算（golden 场景此分支恒不触发）。
  if (
    target.shieldUntilTick != null &&
    target.shieldUntilTick > 0 &&
    state.tick <= target.shieldUntilTick &&
    target.shieldReduction != null &&
    target.shieldReduction > 0
  ) {
    dmg = Math.max(0, Math.round(dmgBase * (1 - target.shieldReduction)));
  }
  // C4b 猎手标记易伤：目标被 MARK（markedUntilTick 仍活跃）时，对其造成的伤害 ×1.25。
  // 仍由本函数（唯一 hp 结算出口）落地，skills 模块绝不直改 hp（discipline B）。
  // 未标记 / 已过期 → dmg 原样结算（golden 场景此分支恒不触发，哈希不受影响）。
  if (target.markedUntilTick != null && target.markedUntilTick > state.tick) {
    dmg = Math.round(dmg * 1.25);
  }
  // CRIT（P2 2026-08-12）：暴击倍率（由 world 用确定性 seed 派生 15% 概率，无随机源）。
  //   critMult>1 时伤害 ×critMult，DamageEvent.crit=true 供客户端大数字/音效反馈。
  //   未设置 → 恒不触发（golden 场景无损）。
  const isCrit = req.critMult != null && req.critMult > 1;
  if (isCrit) {
    dmg = Math.round(dmg * req.critMult);
  }
  const before = target.hp;
  target.hp = Math.max(0, target.hp - dmg);
  const deltaHp = target.hp - before; // 负数

  if (target.hp <= 0) {
    target.status |= EntityStatus.DOWNED;
  }

  return {
    targetId: req.targetId,
    deltaHp,
    statusChange: target.status,
    tick: state.tick,
    crit: isCrit || undefined,
  };
}
