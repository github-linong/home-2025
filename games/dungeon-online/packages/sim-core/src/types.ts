/**
 * types.ts — 共享 schema + 数据定义（systems-index ② 角色与职业 / ③ 敌人与资源数据定义）
 *
 * 本文件是 sim-core 的「类型 + 数据」基座，对应 epics.md E2（S2.1–S2.3）。
 * - S2.1 统一状态/属性模型（供 ④⑥⑦⑧⑪⑬ 共用）
 * - S2.2 敌人原型表（仅数据，非运行时；⑧ 只读类型 ID，纪律 A）
 * - S2.3 资源原型表（仅数据）
 *
 * 纪律：本文件只含类型别名 / 接口 / const 数据，无运行时逻辑。
 * 所有枚举用 `const ... = ... as const` 表达（可被 Node --experimental-strip-types 直接剥离，无需 tsx）。
 */

// ============================================================
// S2.1 统一状态 / 属性模型
// ============================================================

/** 4 职业（守卫士/游侠/术士/医者），覆盖 坦/输出/辅助/控场（systems-index ②）。 */
export const PLAYER_CLASSES = ["tank", "ranger", "mage", "healer"] as const;
export type PlayerClass = (typeof PLAYER_CLASSES)[number];

/**
 * 职业基础属性（GDD⑦ §4 初稿，待 P5 调优）。
 * hp = 基础 HP；moveSpeed = px/s（32px tile 网格）；attackCooldownMs = 普攻 CD。
 */
export interface ClassBase {
  readonly hp: number;
  readonly moveSpeed: number;
  readonly attackCooldownMs: number;
  readonly label: string;
}

export const CLASS_BASE: Record<PlayerClass, ClassBase> = {
  tank: { hp: 140, moveSpeed: 210, attackCooldownMs: 400, label: "守卫士" },
  ranger: { hp: 80, moveSpeed: 278, attackCooldownMs: 400, label: "游侠" },
  mage: { hp: 90, moveSpeed: 248, attackCooldownMs: 400, label: "术士" },
  healer: { hp: 100, moveSpeed: 255, attackCooldownMs: 400, label: "医者" },
};

/**
 * 4 阵营色（art-bible §3，色盲安全）。仅用于角色描边/名牌/自身技光效。
 * P1 蔚蓝 / P2 紫罗兰 / P3 品红 / P4 春绿。
 */
export const FACTION_COLORS = {
  P1: "#4CB5F5",
  P2: "#9B7BE8",
  P3: "#E86FB0",
  P4: "#6FD68A",
} as const;
export type FactionId = keyof typeof FACTION_COLORS;

/** 实体状态 bitmask（ADR-ENG-03 §A）。位运算组合，便于每 tick 紧凑序列化。 */
export const EntityStatus = {
  ALIVE: 1 << 0,
  DOWNED: 1 << 1,
  // OUT = 1<<2：与 DOWNED 紧邻（2 的连续幂），语义上「本 run 出局/旁观」——可逆恢复（救援/
  // 超时）用 DOWNED，永久移除用 DEAD(1<<3)。OUT 与 DOWNED 互斥：超时未救 → 清 DOWNED 置 OUT；
  // OUT 仅由 ⑪ E7.S7.5 超时触发，绝不经由伤害结算（S7.4）；OUT 玩家本 run 作旁观，world reset 才清。
  OUT: 1 << 2,
  DEAD: 1 << 3,
  IFRAME: 1 << 4,
  STUN: 1 << 5,
  SLOW: 1 << 6,
  BUFF: 1 << 7,
} as const;
export type EntityStatusFlag = (typeof EntityStatus)[keyof typeof EntityStatus];

/** 实体种类（ADR-ENG-03 §A）。 */
export const EntityKind = {
  PLAYER: 0,
  ENEMY: 1,
  BOSS: 2,
  RESOURCE: 3,
  PROJECTILE: 4,
  TELEGRAPH: 5,
  // 掉落实体（progression/feedback；3/4/5 已被资源/弹幕/telegraph 占用，故取 6）。
  LOOT: 6,
} as const;
export type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

/** 房间/运行阶段（ADR-NET-01 §D11）。 */
export const RoomPhase = {
  LOBBY: 0,
  ACTIVE: 1,
  BOSS: 2,
  SETTLE: 3,
  RESIDENT: 4,
} as const;
export type RoomPhaseValue = (typeof RoomPhase)[keyof typeof RoomPhase];

/** 状态效果（剩余 tick 计数）。 */
export interface StatusEffect {
  readonly type: number; // 0=眩晕 1=减速 2=增益 …（与 EntityStatus 对应语义）
  readonly remainingTicks: number;
}

/** 世界坐标（网格 px，32px tile 对齐；原点=地牢左上，x右/y下）。 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * 权威实体状态（ADR-ENG-03 §A）。服务器持有，逐 tick diff 下发。
 * 本 Sprint（E2）仅定义 schema；写入逻辑在 E5/E6/E7。
 */
export interface EntityState {
  readonly id: number;
  readonly kind: EntityKindValue;
  readonly pos: Vec2;
  readonly dir: number; // 朝向 0-7
  hp: number;
  maxHp: number;
  status: number; // EntityStatus bitmask
  statusEffects: readonly StatusEffect[];
  readonly ownerId?: number; // PLAYER → 座位
  readonly telegraph?: TelegraphState;
  readonly rescue?: RescueState;
  // ── E8 协作技运行时状态（world.snapshot 公开，供客户端 HUD/可视化渲染）──
  // 仅当实体真实持有该状态才下发（snapshot 中按权威窗口判定），否则 undefined → JSON 丢弃键，
  // 不影响「未持有状态实体」的确定性哈希（与 rescue 先例一致）。
  readonly activeSkill?: number | null; // 当前/最近协作技 id（HUD 提示；玩家初值 null → 不下发）
  readonly shieldUntilTick?: number; // ⑨ SHIELD_ALLY 减伤护盾窗口截止 tick（>world.tick 才下发）
  readonly shieldReduction?: number; // ⑨ SHIELD_ALLY 减伤比例 0..1
  readonly tauntUntilTick?: number; // ⑨ TAUNT 施法者吸引敌火窗口截止 tick（>world.tick 才下发）
  // ── 掉落（progression/feedback；仅 loot 实体携带，world.snapshot 公开）──
  readonly lootType?: number; // 0=medkit | 1=ammo | 2=buff
  readonly value?: number; // 掉落数值：medkit=治疗量 / buff=百分比(如 20) / ammo=0
}

/** telegraph 静态可读预警（P3 硬约束，art-bible §7）。 */
export interface TelegraphState {
  readonly shape: number; // 0=圆环 1=AOE填充 2=锥形 3=线性
  readonly color: number; // 0=DANGER
  readonly startTick: number;
  readonly applyTick: number; // 伤害结算 tick（由 ⑦ 在服务器裁定，D13）
  readonly radius: number;
  /**
   * 攻击者朝向（单位向量，世界坐标 x右/y下）。仅「方向性」形状（CONE/LINE）由服务端填充，
   * RING/AOE_FILL 径向对称省略（undefined → JSON.stringify 自动丢弃键，不影响确定性哈希）。
   * 客户端据 `dir` 旋转 CONE 三角 apex / LINE 矩形长轴，使其沿攻击者 facing 而非恒指 +x
   * （N2 / C3 子项：方向性 telegraph 缺朝向字段）。由 `world.snapshot` 从攻击者 `Actor.dir`
   * (0-7) 换算；约定 0=E(→+x)，顺时针（屏幕 y 下）：1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE。
   */
  readonly dir?: Vec2;
}

/** 救援读条状态（⑪）。 */
export interface RescueState {
  readonly targetId: number;
  progressTicks: number;
  readonly totalTicks: number;
}

/**
 * 权威世界快照（ADR-ENG-03 §A）。diff 仅含变化实体（由 ① 广播）。
 */
export interface WorldSnapshot {
  readonly tick: number;
  readonly runId: string;
  readonly roomPhase: RoomPhaseValue;
  /** 数据面路由标记（C2）：客户端据 `type` 区分快照与控制/房间消息，避免脆弱的形状探测。 */
  readonly type: "snapshot";
  readonly entities: readonly EntityState[];
  /**
   * 各玩家已服务端消费的最大 seq（S4.3 reconciliation / S4.5 延迟指示）。
   * key=playerId(=seatId=实体 ownerId)；随快照下发，供客户端 100ms 插值/回正。
   * 序列化后键为字符串（JSON 数字键→字符串），读取端用 lastProcessedSeq[seatId] 即可。
   */
  readonly lastProcessedSeq?: Record<number, number>;
}

/**
 * 冻结态（D8 / P4 保底）：断线瞬间抓拍，单次持有，不被后续 room tick 覆盖。
 * 用于重连无跳变还原（含 DOWNED 剩余窗口）。
 */
export interface PersonalState {
  readonly seatId: number;
  status: number; // EntityStatus bitmask
  hp: number;
  downedRemainingTicks: number;
  rescueProgressTicks: number;
}

// ============================================================
// S2.2 敌人原型表（系统 ③，仅数据；⑧ 只读类型 ID，纪律 A）
// ============================================================

export type EnemyTier = "grunt" | "elite" | "boss";

/** telegraph 形状（与 EntityState.telegraph.shape 对齐）。 */
export const TelegraphShape = {
  RING: 0,
  AOE_FILL: 1,
  CONE: 2,
  LINE: 3,
} as const;
export type TelegraphShapeValue = (typeof TelegraphShape)[keyof typeof TelegraphShape];

/** 危险色（art-bible §3 DANGER）。 */
export const DANGER_COLOR = 0; // 编码见 EntityState.telegraph.color

/**
 * 敌人原型（纯数据，非运行时）。
 * telegraphTicks = 前摇最小 tick 数；GDD⑧ §4：杂兵≥21(0.7s)/精英≥24(0.8s)/Boss≥30(1.0s) @30Hz。
 * 满足 ADR-NET-01 D12 MIN_TELEGRAPH_TICKS=18（0.6s）下限。
 */
export interface EnemyPrototype {
  readonly id: string;
  readonly tier: EnemyTier;
  readonly hpMin: number;
  readonly hpMax: number;
  readonly attackDamageMin: number;
  readonly attackDamageMax: number;
  /**
   * 单次普攻伤害（平衡初稿，E6）。enemy-ai 经意图提交、world 经 ⑦ resolveDamage
   * 以 `enemyDamage` 落地；与玩家 PLAYER_ATTACK_DAMAGE=18 区分（敌我伤害分离，非 18）。
   */
  readonly attackDamage: number; // 平衡初稿
  /** 移动速率 px/s（平衡初稿，E6）；world 按 `speed/30` 每 tick 位移。 */
  readonly speed: number; // 平衡初稿
  /** 攻击触发范围 px（平衡初稿，E6）；敌人与目标距离 ≤ 此值即发起攻击。 */
  readonly attackRange: number; // 平衡初稿
  readonly telegraphTicks: number; // 前摇最小 tick
  readonly shape: TelegraphShapeValue;
}

export const ENEMY_PROTOTYPES: Record<string, EnemyPrototype> = {
  grunt_swarm: {
    id: "grunt_swarm",
    tier: "grunt",
    hpMin: 30,
    hpMax: 60,
    attackDamageMin: 8,
    attackDamageMax: 12,
    attackDamage: 8, // 平衡初稿
    speed: 70, // 平衡初稿 px/s (WEB-FEEL: 110 → 70, 拉开与玩家差距)
    attackRange: 40, // 平衡初稿 px
    telegraphTicks: 21, // 0.7s @30Hz
    shape: TelegraphShape.RING,
  },
  elite_warden: {
    id: "elite_warden",
    tier: "elite",
    hpMin: 120,
    hpMax: 200,
    attackDamageMin: 15,
    attackDamageMax: 20,
    attackDamage: 12, // 平衡初稿
    speed: 60, // 平衡初稿 px/s (WEB-FEEL: 95 → 60, 拉开与玩家差距)
    attackRange: 48, // 平衡初稿 px
    telegraphTicks: 24, // 0.8s @30Hz
    shape: TelegraphShape.AOE_FILL,
  },
  boss_emberlord: {
    id: "boss_emberlord",
    tier: "boss",
    hpMin: 800,
    hpMax: 1500,
    attackDamageMin: 20,
    attackDamageMax: 35,
    attackDamage: 20, // 平衡初稿
    speed: 50, // 平衡初稿 px/s (WEB-FEEL: 80 → 50, 拉开与玩家差距)
    attackRange: 64, // 平衡初稿 px
    telegraphTicks: 30, // 1.0s @30Hz
    shape: TelegraphShape.CONE,
  },
};

// ============================================================
// S2.3 资源原型表（系统 ③，仅数据）
// ============================================================

export type ResourceCategory = "medkit" | "ammo" | "buff";

/** 资源原型（纯数据）。效果数值初稿，待 P5 调优。 */
export interface ResourcePrototype {
  readonly id: string;
  readonly category: ResourceCategory;
  /** 药品：治疗量；弹药：补充量；增益：攻/防/速 buff 幅度（百分比）。 */
  readonly magnitude: number;
  /** 增益持续时间 tick（仅 buff 类）。 */
  readonly durationTicks: number;
}

export const RESOURCE_PROTOTYPES: Record<string, ResourcePrototype> = {
  medkit_small: { id: "medkit_small", category: "medkit", magnitude: 40, durationTicks: 0 },
  ammo_pack: { id: "ammo_pack", category: "ammo", magnitude: 1, durationTicks: 0 },
  buff_rage: { id: "buff_rage", category: "buff", magnitude: 20, durationTicks: 90 }, // +20% 攻 / 3s @30Hz
};

// ============================================================
// S2.4 掉落（progression/feedback；E? 拾取闭环，平衡初稿）
// ============================================================

/** 玩家拾取掉落物的邻近半径（px）。中心距 ≤ 此值即消费。 */
export const PICKUP_RADIUS = 28;

/** grunt/elite 掉落概率（boss 必掉，见 world.ts trySpawnLoot）。 */
export const LOOT_DROP_CHANCE = 0.5;

/** medkit 治疗量（与 RESOURCE_PROTOTYPES.medkit_small.magnitude 对齐）。 */
export const LOOT_MEDKIT_HEAL = 40;

/** buff 攻击增幅比例（小数；拾取时 buffMult = 1 + 此值 = 1.2 → +20%）。 */
export const LOOT_BUFF_MULT = 0.2;

/** buff loot `value` 字段（百分比，供客户端渲染 +20%；服务端用 LOOT_BUFF_MULT 计算 buffMult）。 */
export const LOOT_BUFF_PERCENT = 20;

/** buff 持续时间 tick（~3s @30Hz）。 */
export const LOOT_BUFF_TICKS = 90;

/** 掉落实体上限（防 runaway；见 world.ts trySpawnLoot）。 */
export const MAX_LOOT_ENTITIES = 40;

// ============================================================
// 跨系统共享传输类型（① format-owner 定义，ADR-ENG-03 §B）
// ============================================================

/** 刷怪点实例（GDD⑤ §3 SpawnPoint schema；纪律 A：⑧ 只读实例，不调生成函数）。 */
export interface SpawnPoint {
  readonly pos: Vec2;
  readonly enemyTypeId: string; // 引用 ③ 敌人原型表 ID（非运行时实例）
  readonly wave: number;
  readonly count: number;
}

/** 玩家输入指令（D6 / ADR-NET-01 §D6）。 */
export const InputAction = {
  MOVE: 0,
  ATTACK: 1,
  DODGE: 2,
  SKILL: 3,
  SIGNAL: 4,
} as const;
export type InputActionValue = (typeof InputAction)[keyof typeof InputAction];

export interface InputCmd {
  readonly seq: number; // 防重放（C11）
  readonly tick: number;
  readonly action: InputActionValue;
  readonly dir: Vec2; // int8 向量，序列化为 int8
  readonly target?: number;
  readonly param?: number;
}

// ============================================================
// S5.1–S5.6 战斗结算契约（系统⑦；E5 接入）
// ============================================================

/**
 * 伤害请求（客户端意图 / ⑧ enemy-ai 提交给 ⑦）。
 * - `amount` 由客户端上报但 **被 ⑦ 完全忽略**（C11）：真实伤害由服务端裁决。
 * - `kind` 对齐 InputCmd.action 的战斗子集（ATTACK=1 / DODGE=2 / SKILL=3）。
 * - `tick` 为请求所属权威 tick（用于 windup / IFRAME 窗口裁决，D12）。
 */
export interface DamageRequest {
  readonly sourceId: number;
  readonly targetId: number;
  readonly amount: number; // 客户端上报，⑦ 忽略（C11）
  readonly tick: number;
  readonly kind: number; // CombatKindValue
  /**
   * 敌人来源的伤害（E6，服务端裁决，仅 world 经 ⑧ 意图提交）。玩家攻击恒为
   * PLAYER_ATTACK_DAMAGE（C11 忽略客户端 amount）。未提供（undefined）→ 走玩家裁决路径。
   */
  readonly enemyDamage?: number; // E6 平衡初稿，服务端裁决
}

/**
 * 伤害结算事件（⑦ 输出，供 ① 广播 / ⑪ 倒地接管）。
 * - `deltaHp`：负值=扣血，0=no-op / 被 IFRAME 抵消。
 * - `statusChange`：结算后目标实体的 EntityStatus bitmask。
 * - `tick`：结算发生的权威 tick。
 */
export interface DamageEvent {
  readonly targetId: number;
  readonly deltaHp: number;
  readonly statusChange: number;
  readonly tick: number;
}

/**
 * 战斗意图（客户端高层语义；与 InputAction.ATTACK/DODGE/SKILL 对齐）。
 * 经网关 → InputCmd（action+target/param）落到 world，再路由到 ⑦ resolveDamage。
 * 纪律（C11）：意图只携带 targetId / skillId，**绝不包含伤害数值**。
 */
export type CombatIntentType = "ATTACK" | "DODGE" | "SKILL";

export interface CombatIntent {
  readonly type: CombatIntentType;
  readonly targetId?: number;
  readonly skillId?: number;
}

// ============================================================
// S8.1–S8.3 协作技（系统⑨ / E8，闭合 O-A 设计缺口）
// ============================================================
//
// 协作技是「影响盟友」的协同能力（区别于 solo 普攻/闪避）：护盾链接（减伤）、急救链
// （加速救援）、嘲讽战吼（吸引敌火保护队友）。所有数值为 **P5 平衡初稿（待调）**。
//
// 纪律 B（关键）：本文件只含「数据 + 类型」，无任何运行时逻辑；技能的真实落地（改
// hp/status/iframe/shield/救援/嘲讽）只发生在 world.step / combat.resolveDamage——
// skills.ts 仅做「纯校验 + 效果数学」并产出 SkillApplication 意图结构体，绝不直改状态。

/** 协作技目标模式（决定 SKILL InputCmd 的 target 取值与校验）。 */
export const SkillTargetMode = {
  SELF: 0, // 仅施法者自身（如嘲讽：吸引敌火保护队友）
  ALLY: 1, // 必须是指定「其他玩家盟友」（护盾/急救链；不可指向自己或敌人）
  ENEMY: 2, // 预留（未来进攻型协作技；本 Epic 未启用）
} as const;
export type SkillTargetModeValue = (typeof SkillTargetMode)[keyof typeof SkillTargetMode];

/** 协作技 ID（E8 三技能；预留扩展位）。 */
export const SKILL_IDS = {
  SHIELD_ALLY: 0, // 护盾链接：给目标盟友施加减伤护盾窗口
  REVIVE_BOOST: 1, // 急救链：给倒地盟友救援读条直接加成（加速归队）
  TAUNT: 2, // 嘲讽战吼：施法者吸引敌火（敌人 AI 优先锁定）
} as const;
export type SkillIdValue = (typeof SKILL_IDS)[keyof typeof SKILL_IDS];

/** 协作技效果参数（由 SKILL_PROTOTYPES 持有；skills.ts 读取，world.step 落地）。 */
export interface SkillEffect {
  /** 减伤护盾持续 tick（SHIELD_ALLY）；0 = 无护盾效果。 */
  readonly shieldTicks: number;
  /** 减伤比例 0..1（SHIELD_ALLY）；0 = 不减伤。由 combat.resolveDamage 消费。 */
  readonly shieldReduction: number;
  /** 给倒地盟友救援读条加成的 tick（REVIVE_BOOST）；0 = 无。 */
  readonly rescueBoostTicks: number;
  /** 施法者吸引敌火的 tick（TAUNT）；0 = 无。 */
  readonly tauntTicks: number;
}

/** 协作技原型（纯数据；30Hz → tick 换算见各字段注释）。 */
export interface SkillPrototype {
  readonly id: number;
  readonly name: string;
  readonly cooldownTicks: number; // 冷却 tick（≈ 12s=360 / 10s=300 / 14s=420 @30Hz）
  readonly castTicks: number; // 施法前摇 tick；0 = 即时（服务器权威落地，无客户端前摇）
  readonly targetMode: SkillTargetModeValue;
  readonly effect: SkillEffect;
}

/**
 * SKILL_PROTOTYPES —— 协作技定义表（闭合 O-A：技能从未分化 → 真正协同技）。
 * 平衡初稿（待 P5 调优）：
 *   - SHIELD_ALLY：减伤 50%（shieldReduction=0.5）持续 3s(90tick)，CD 12s(360tick)。
 *   - REVIVE_BOOST：倒地盟友救援读条 +1.5s(45tick)，CD 10s(300tick)。
 *   - TAUNT：施法者吸引敌火 4s(120tick)，CD 14s(420tick)。
 */
export const SKILL_PROTOTYPES: Record<string, SkillPrototype> = {
  SHIELD_ALLY: {
    id: SKILL_IDS.SHIELD_ALLY,
    name: "护盾链接",
    cooldownTicks: 360,
    castTicks: 0,
    targetMode: SkillTargetMode.ALLY,
    effect: { shieldTicks: 90, shieldReduction: 0.5, rescueBoostTicks: 0, tauntTicks: 0 },
  },
  REVIVE_BOOST: {
    id: SKILL_IDS.REVIVE_BOOST,
    name: "急救链",
    cooldownTicks: 300,
    castTicks: 0,
    targetMode: SkillTargetMode.ALLY,
    effect: { shieldTicks: 0, shieldReduction: 0, rescueBoostTicks: 45, tauntTicks: 0 },
  },
  TAUNT: {
    id: SKILL_IDS.TAUNT,
    name: "嘲讽战吼",
    cooldownTicks: 420,
    castTicks: 0,
    targetMode: SkillTargetMode.SELF,
    effect: { shieldTicks: 0, shieldReduction: 0, rescueBoostTicks: 0, tauntTicks: 120 },
  },
};

/** 按 id 取协作技原型（skills.ts 纯查表）。 */
export function getSkillPrototype(id: number): SkillPrototype | null {
  for (const key of Object.keys(SKILL_PROTOTYPES)) {
    if (SKILL_PROTOTYPES[key].id === id) return SKILL_PROTOTYPES[key];
  }
  return null;
}
