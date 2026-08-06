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
  tank: { hp: 140, moveSpeed: 140, attackCooldownMs: 400, label: "守卫士" },
  ranger: { hp: 80, moveSpeed: 185, attackCooldownMs: 400, label: "游侠" },
  mage: { hp: 90, moveSpeed: 165, attackCooldownMs: 400, label: "术士" },
  healer: { hp: 100, moveSpeed: 170, attackCooldownMs: 400, label: "医者" },
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
}

/** telegraph 静态可读预警（P3 硬约束，art-bible §7）。 */
export interface TelegraphState {
  readonly shape: number; // 0=圆环 1=AOE填充 2=锥形 3=线性
  readonly color: number; // 0=DANGER
  readonly startTick: number;
  readonly applyTick: number; // 伤害结算 tick（由 ⑦ 在服务器裁定，D13）
  readonly radius: number;
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
    speed: 110, // 平衡初稿 px/s
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
    speed: 95, // 平衡初稿 px/s
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
    speed: 80, // 平衡初稿 px/s
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
