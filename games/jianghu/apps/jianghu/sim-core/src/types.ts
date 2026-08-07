/**
 * types.ts — 共享 schema + 数据定义（sim-core 类型基座）
 * ===========================================================================
 * 角色 = ① format-owner。完整定义避免「后期补字段污染确定性哈希」（dungeon-online
 * snapshot-gap-closure 教训 → jianghu 控制清单 C12）。
 *
 * 本文件一次性声明 EntityState 的全部可能字段（含 parryState / lootTtl / telegraph /
 * entrance 等），序列化时按「仅当实体真实持有该状态才下发对应字段，否则 undefined
 * （JSON 自动丢弃 / 二进制走 changeMask）」——保证未持有状态的实体确定性哈希不被污染。
 *
 * 纪律：本文件只含类型别名 / 接口 / const 数据 + 纯枚举，无运行时逻辑（与 dungeon-online 一致）。
 * 所有枚举用 `const ... = ... as const` 表达（可被 Node --experimental-strip-types 直接剥离）。
 */

// ============================================================
// 实体种类 / 状态 / 阶段
// ============================================================

/** 实体种类（architecture §6）。 */
export const EntityKind = {
  PLAYER: 0,
  ENEMY: 1,
  BOSS: 2,
  LOOT_GROUND: 3, // 地面溢出掉落（背包满，C-Per-3）
  TELEGRAPH: 4, // 攻击预警
  ENTRANCE: 5, // 裂隙异象漩涡（副本入口，静态）
} as const;
export type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

/** 实体状态 bitmask（architecture §6）。位运算组合，便于每 tick 紧凑序列化。 */
export const EntityStatus = {
  ALIVE: 1 << 0,
  STUN: 1 << 1,
  SLOW: 1 << 2,
  PARRY_ACTIVE: 1 << 3,
  IFRAME: 1 << 4,
} as const;
export type EntityStatusFlag = (typeof EntityStatus)[keyof typeof EntityStatus];

/** 世界 / 房间阶段（architecture §6 WorldSnapshot.phase）。 */
export const RoomPhase = {
  OVERWORLD: 0, // 主世界 RESIDENT
  DUNGEON: 1, // 副本 instance
  SETTLE: 2, // 结算 / 出本
} as const;
export type RoomPhaseValue = (typeof RoomPhase)[keyof typeof RoomPhase];

// ============================================================
// 基础数据结构
// ============================================================

/** 世界坐标（网格 px，TILE=48 对齐，连续插值坐标；原点=地图左上，x右/y下）。 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** 状态效果（剩余 tick 计数）。 */
export interface StatusEffect {
  readonly type: number; // 0=眩晕 1=减速 2=增益 …
  readonly remainingTicks: number;
}

// ── 条件序列化字段（仅真实持有时下发，否则 undefined）──

/** 格挡状态（R2b 服务端时间窗校验；combat 在 application_tick 检查覆盖）。 */
export interface ParryState {
  readonly active: boolean;
  readonly windowEndTick: number; // = parry 起始 tick + PARRY_TICKS - 1（闭区间含末 tick，恰 PARRY_TICKS 个 tick）
}

/** 地面溢出掉落（背包满落脚下，TTL 自动消失；C-Per-3 / loot §⑤）。 */
export interface LootState {
  readonly itemId: number;
  readonly rarity: number; // 0=白 1=蓝 2=金 3=暗金
  readonly affixes: readonly number[]; // 词缀 id 列表
  readonly ttlTicks: number; // 剩余存活 tick，客户端倒计时显隐
}

/** 预警（BOSS/精英 telegraph；P3 硬约束可读下界 MIN_TELEGRAPH_TICKS）。 */
export interface TelegraphState {
  readonly shape: number; // 0=圆环 1=AOE填充 2=锥形 3=线性
  readonly color: number; // 0=DANGER
  readonly startTick: number;
  readonly applyTick: number; // 伤害结算 tick（服务端裁定）
  readonly radius: number;
}

/** 入口（裂隙异象漩涡，静态；dungeon §②）。 */
export interface EntranceState {
  readonly cooldownTicks: number; // 防刷本冷却（C-Dgn-4）
  readonly lastUsedTick: number;
}

/** 玩家属性（客户端显血/面板用）。 */
export interface AttrSet {
  readonly str: number;
  readonly dex: number;
  readonly vit: number;
  /** E7：装备后派生属性（面板展示；C12 条件序列化，仅玩家实体持有，可缺省保持旧持久化兼容）。 */
  readonly atk?: number;
  /** 生命上限（含装备 maxHp 加成，= PLAYER_MAX_HP + 加成）。 */
  readonly maxHp?: number;
  /** 暴击率千分比（150 = 15%）。 */
  readonly crit?: number;
}

// ============================================================
// 权威实体状态（architecture §6；逐 tick diff 下发）
// ============================================================

export interface EntityState {
  readonly id: number; // u16
  readonly kind: EntityKindValue; // u8
  readonly pos: Vec2; // 网格 px
  readonly dir: number; // 朝向 0-7

  hp: number; // u16
  maxHp: number; // u16
  status: number; // EntityStatus bitmask
  statusEffects: readonly StatusEffect[];

  // ── 玩家专属（仅持有才下发）──
  readonly ownerId?: number; // u16，座位/玩家 id
  readonly attrs?: AttrSet; // 属性面板
  readonly skillCd?: readonly number[]; // 4 槽 CD（tick 左）
  readonly parryState?: ParryState; // R2b 服务端时间窗

  // ── 敌人/BOSS ──
  readonly tier?: number; // 0=normal 1=elite 2=boss

  // ── 地面溢出掉落（背包满）──
  readonly loot?: LootState; // 含 ttlTicks（C-Per-3）

  // ── 预警（BOSS/精英 telegraph）──
  readonly telegraph?: TelegraphState;

  // ── 入口（裂隙异象漩涡，静态）──
  readonly entrance?: EntranceState;
}

// ============================================================
// 权威世界快照（architecture §6）
// ============================================================

export interface WorldSnapshot {
  readonly tick: number; // u32
  readonly roomId: string; // 主世界 RESIDENT id 或 副本 instance id
  readonly phase: RoomPhaseValue;
  readonly entities: readonly EntityState[]; // diff 仅含变化实体
}

// ============================================================
// 跨系统共享传输类型（① format-owner 定义）
// ============================================================

/** 玩家输入动作（ADR-JH-ENG-01 §3）。 */
export const InputAction = {
  MOVE: 0,
  PARRY: 1,
  SKILL1: 2,
  SKILL2: 3,
  SKILL3: 4,
  SKILL4: 5,
  SIGNAL: 6,
  STOP: 7, // 松开移动键：清 lastMove 立即停（协议缺口修复，P0 手感；见 web-client README §3/§5）
  ATTACK: 8, // E8：普攻（目标实体 id 由 InputCmd.targetEntityId 指定；服务端权威 CD/距离/伤害）
} as const;
export type InputActionValue = (typeof InputAction)[keyof typeof InputAction];

/**
 * 玩家输入指令（ADR-JH-ENG-01 §3；C11 seq 防重放/注入）。
 * 上报节奏 = 每 tick 一次（12Hz）。
 */
export interface InputCmd {
  readonly seq: number; // u32，严格递增，服务端校验防重放/注入
  readonly tick: number; // u16，上报时客户端所见 tick（仅遥测，非回滚锚）
  readonly action: InputActionValue;
  readonly dir: number; // 0-7 朝向（MOVE 用）
  readonly targetTile?: number; // u16，目标格（MOVE 用；E8 点击移动：packTile(gx,gy)=gx*64+gy）
  readonly targetEntityId?: number; // u16，普攻目标（ATTACK 用；E8 客户端点击的敌人/BOSS id）
  readonly skillSlot?: number; // u8，SKILL 用（0-3）
  readonly param?: number; // u8，SIGNAL/保留
}

// ============================================================
// 刷怪点（spawning § / dungeonGen 输出；纪律 A：dungeonGen 只读，spawning 引用类型）
// ============================================================

/** 刷怪点实例（GDD spawning §3 SpawnPoint schema）。dungeonGen 产出，spawning 只读引用。 */
export interface SpawnPoint {
  readonly pos: Vec2;
  readonly enemyTypeId: string; // 引用敌人原型表 ID（非运行时实例）
  readonly wave: number;
  readonly count: number;
}
