/**
 * constants.ts — 江湖 全局共享常量（单一来源，C1 / C7）
 * ===========================================================================
 * 本文件是「预测 / 模拟 / 网络 / 持久化」全部量化常量的**唯一出处**（single source of truth）。
 *
 * 设计纪律（吸收 dungeon-online C1「手镜像」教训）：
 *   - 服务端所有模块（run-runtime / config / movement / combat / loot / spawning /
 *     dungeonGen / parry）都从本文件 import 这些常量；
 *   - **禁止**在本文件之外裸写 `TICK_RATE=12`、`83.33`、`BASE_SPEED=4`、`PARRY_TICKS=3`、
 *     `MIN_TELEGRAPH_TICKS=8` 等语义常量；
 *   - 客户端后续经「同份」或 codegen 消费（E2 客户端脚手架），杜绝双写漂移。
 *
 * 所有可在 12Hz 下推导的值（TICK_MS / CELLS_PER_TICK / SKILL_CD_*_TICKS）一律由上面的
 * 基础常量推导，绝不裸写魔法数字。
 */

// ─────────────────────────────────────────────────────────────
// 网络 / tick（ADR-JH-ENG-01 §2；C1 全局唯一）
// ─────────────────────────────────────────────────────────────

/** 权威 tick 率（tick/s）。12 ⇒ 83.33ms/tick。全工程唯一引用点，禁止裸写 12 / 83.33。 */
export const TICK_RATE = 12;

/** 单 tick 时长（ms）= 1000 / TICK_RATE。由 TICK_RATE 推导，单一来源。 */
export const TICK_MS = 1000 / TICK_RATE;

// ─────────────────────────────────────────────────────────────
// 移动（movement §③·§⑥）
// ─────────────────────────────────────────────────────────────

/** 基础移动速度（格/s）。 */
export const BASE_SPEED = 4;

/** 每 tick 位移（格）= BASE_SPEED / TICK_RATE = 4/12 ≈ 0.333。客户端插值据此平滑。 */
export const CELLS_PER_TICK = BASE_SPEED / TICK_RATE;

// ─────────────────────────────────────────────────────────────
// 网格（俯视 48px tile；architecture §1）
// ─────────────────────────────────────────────────────────────

/** 网格 tile 像素边长（px）。坐标以 px 表达，渲染时 ÷ TILE 对齐格。 */
export const TILE = 48;

// ─────────────────────────────────────────────────────────────
// 格挡（combat §⑥；R2a 量化微调，ADR-JH-ENG-01 §2）
// ─────────────────────────────────────────────────────────────

/** 格挡窗口（tick）。PARRY_WINDOW=200ms @12Hz=2.4 → 向上取整 3 tick = 250ms（≥200ms 体感）。 */
export const PARRY_TICKS = 3;

/** 格挡减伤比例（combat §⑥ / ADR-JH-ENG-01 §2）。0.6 = 减伤 60%。 */
export const PARRY_REDUCTION = 0.6;

/** 格挡手感 RTT 容差（ms），combat §⑦ 验收「≤150ms 延迟准确率 ≥95%」。 */
export const PARRY_RTT_TOL_MS = 150;

// ─────────────────────────────────────────────────────────────
// telegraph（BOSS/精英攻击预警可读下界；ADR-JH-ENG-01 §2）
// ─────────────────────────────────────────────────────────────

/** 最小 telegraph 前摇（tick）。P3 可读下界 0.6s @12Hz=7.2 → 8 tick = 666ms。 */
export const MIN_TELEGRAPH_TICKS = 8;

// ─────────────────────────────────────────────────────────────
// E15：BOSS telegraph 预警（D2 落地；C7 单一来源，全工程唯一引用点）
// ─────────────────────────────────────────────────────────────

/**
 * telegraph 前摇时长（tick）= 1s @12Hz = 12。
 * world 在 BOSS phase2 AOE 生成 TELEGRAPH 实体时用 startTick=t / applyTick=t+TELEGRAPH_TICKS
 * 表达（TelegraphState schema，types.ts；客户端 drawTelegraph 依 startTick→applyTick 呼吸显隐）。
 * ≥ MIN_TELEGRAPH_TICKS（8）可读下界（P3 硬约束）。
 */
export const TELEGRAPH_TICKS = TICK_RATE;

/**
 * BOSS AOE 警示圈半径（px）= 1.5×TILE = 72px。
 * 覆盖近战站桩（接触 48px）到技能射程 0 槽（72px）区间——站桩必吃，需走出圈躲避。
 * 客户端 drawTelegraph 以 t.radius 画圆（缺省 60），服务端本值为唯一来源（C7）。
 */
export const TELEGRAPH_RADIUS = Math.round(1.5 * TILE);

/**
 * BOSS phase2 AOE 预警间隔（tick）= 3s @12Hz = 36。
 * 主理人拍板（E15）：BOSS（tier=2）phase≥2 时每 BOSS_AOE_INTERVAL_TICKS 在自身周围生成
 * AOE 警示圈 → TELEGRAPH_TICKS 后落刀（对圈内玩家 resolveDamage）+ 移除。
 */
export const BOSS_AOE_INTERVAL_TICKS = 3 * TICK_RATE;

/**
 * BOSS AOE 伤害倍率（× 敌人攻击力）。GDD combat §⑥ BOSS ATK ≈ 普通 ×10 = 80
 * （ENEMY_BASE_ATK×HP_MULT.boss）→ AOE = 120（1s 预警可躲，吃圈即死；平衡旋钮，后续可调）。
 * 取「敌人攻击力 ×1.5」（E15 主理人拍板；GDD 无 AOE 固定值）。
 */
export const BOSS_AOE_DAMAGE_MULT = 1.5;

// ─────────────────────────────────────────────────────────────
// 客户端插值 / 预测缓冲
// ─────────────────────────────────────────────────────────────

/** 客户端插值缓冲（ms），复用 dungeon D6。 */
export const INTERP_DELAY_MS = 100;

/** 预测缓冲条数 ≈ ceil(RTT/2/TICK_MS)+2（RTT 150–250ms ⇒ 3–4 条）。 */
export const PREDICT_BUFFER = Math.ceil(PARRY_RTT_TOL_MS / 2 / TICK_MS) + 2;

// ─────────────────────────────────────────────────────────────
// 升级 / 经验（持久化 §；ADR 量化常量）
// ─────────────────────────────────────────────────────────────

/** 升级经验需求：XP_req = 50 · L^1.5（L = 目标等级）。单一来源公式。 */
export function xpForLevel(level: number): number {
  return Math.floor(50 * Math.pow(Math.max(1, level), 1.5));
}

/**
 * 每级属性成长（E9，C7 单一来源；GDD §8.3-7 三系线性 MVP 映射）：
 *   - str → atk：每级 +1 基础攻击（LEVEL_ATK_PER_LEVEL）；
 *   - vit → maxHp：每级 +5 生命上限（LEVEL_MAXHP_PER_LEVEL）；
 *   - dex → 暴击/攻速：Phase-2 预留（本常量不承载，world.levelStatsFor 注释说明）。
 */
export const LEVEL_ATK_PER_LEVEL = 1;
export const LEVEL_MAXHP_PER_LEVEL = 5;

// ─────────────────────────────────────────────────────────────
// 掉落（loot §；ADR §）
// ─────────────────────────────────────────────────────────────

/** 掉落率：普通 0.30 / 精英·BOSS 1.0（必然掉）。 */
export const DROP_RATE = {
  normal: 0.3,
  elite: 1.0,
  boss: 1.0,
} as const;

// ─────────────────────────────────────────────────────────────
// 词缀数（loot §；ADR §）
// ─────────────────────────────────────────────────────────────

/** 词缀数量区间：白 0-1 / 蓝 2 / 金 3-4 / 暗金 4+1（暗金额外 +1 固有词缀）。 */
export const AFFIX_COUNTS = {
  white: [0, 1],
  blue: [2, 2],
  gold: [3, 4],
  darkgold: [5, 5], // 4 + 1 固有
} as const;

export type Rarity = keyof typeof AFFIX_COUNTS;

// ─────────────────────────────────────────────────────────────
// 敌人 HP 倍率（spawning §；ADR §）
// ─────────────────────────────────────────────────────────────

/** 精英 ×3 / BOSS ×10 HP 倍率（普通 ×1）。 */
export const HP_MULT = {
  normal: 1,
  elite: 3,
  boss: 10,
} as const;

export type EnemyTier = keyof typeof HP_MULT;

/**
 * 击杀经验表（E9，C7 确定性常量，按 EnemyTier 索引）。
 * 击杀者（lastDamagerSeatId）击杀敌人/BOSS 时获得对应经验。
 */
export const ENEMY_XP: Readonly<Record<EnemyTier, number>> = {
  normal: 5,
  elite: 20,
  boss: 80,
} as const;

// ─────────────────────────────────────────────────────────────
// 技能 CD（combat §；ADR §）
// ─────────────────────────────────────────────────────────────

/** 技能 CD 区间（秒）。 */
export const SKILL_CD_SECONDS = { min: 3, max: 8 } as const;

/** 技能 CD 下限（tick）= 3s × 12 = 36。 */
export const SKILL_CD_MIN_TICKS = Math.round(SKILL_CD_SECONDS.min * TICK_RATE);

/** 技能 CD 上限（tick）= 8s × 12 = 96。 */
export const SKILL_CD_MAX_TICKS = Math.round(SKILL_CD_SECONDS.max * TICK_RATE);

// ─────────────────────────────────────────────────────────────
// 背包（persistence §；ADR §）
// ─────────────────────────────────────────────────────────────

/** 背包上限（persistence §）。背包满 → 地面溢出（loot.ttlTicks，C-Per-3）。 */
export const INVENTORY_CAP = 60;

// ─────────────────────────────────────────────────────────────
// 地面溢出掉落 TTL（persistence § / loot §⑤；C-Per-3）
// ─────────────────────────────────────────────────────────────

/**
 * 地面溢出掉落存活时长（tick）。背包满溢出落脚下，TTL 后消失（不邮件，ADR 推荐默认③）。
 * 150s @12Hz。单一来源：EntityState.loot.ttlTicks 由本常量填充（C7）。
 */
export const LOOT_GROUND_TTL_TICKS = 1800;

// ─────────────────────────────────────────────────────────────
// 战斗 / 刷怪 / 掉装（E4 联调；combat/spawning/loot GDD 初值，C7 单一来源）
// ─────────────────────────────────────────────────────────────

/** 玩家最大 HP（world 出生与死亡复活用；与 E1 占位 100 对齐，combat §⑥ / persistence SAFE_SPAWN 同源）。 */
export const PLAYER_MAX_HP = 100;

/** 玩家基础三围（STR/DEX/VIT）。C7 单一来源：persistence.DEFAULT_ATTRS 引用此处（E7），world 快照 attrs 回填同源。 */
export const PLAYER_BASE_ATTRS: Readonly<{ str: number; dex: number; vit: number }> = Object.freeze({ str: 5, dex: 5, vit: 5 });

/**
 * 玩家基础攻击（E8 重定：普攻基础伤害 + 面板「攻击」展示基值共用，单一来源）。
 * E7 时按 GDD k_str=2 × STR=5 = 10 仅作属性面板展示基准；E8 拍板 PLAYER_BASE_ATK=8 作为
 * 暗黑式普攻基础伤害（8 dmg / 0.5s），面板「攻击」同步展示 8 + 装备 atk —— 显示值 = 实际普攻
 * 伤害（更直观），不再保留 10 的旧展示语义（equip-message.test 断言同步更新 10→8）。
 */
export const PLAYER_BASE_ATK = 8;

/** 普攻命中半径（px）= 1×TILE（E8 近战范围判定；暗黑式左键点选普攻）。 */
export const MELEE_RANGE = TILE;

/** 普攻间隔（tick）= 0.5s @12Hz（E8 普攻 CD；attackSpeed 缩短 CD，无装备 → 6，golden 锚点）。 */
export const ATTACK_CD_TICKS = 6;

/** 点击移动到达容差（px）= 0.5×TILE；目标格距离 ≤ 容差即到达 → 自动停止并清 lastMove（E8）。 */
export const TARGET_ARRIVE_TOL = Math.round(0.5 * TILE);

/** 普通怪基础 HP（spawning：enemyHp = ENEMY_BASE_HP * HP_MULT[tier]）。MVP 平衡初值（spawning §⑥ / combat §⑥）。 */
export const ENEMY_BASE_HP = 30;

/** 普通怪接触伤害基础（enemyContact = ENEMY_BASE_ATK * HP_MULT[tier]）。MVP 平衡初值（combat §⑥ 敌人接触伤害）。 */
export const ENEMY_BASE_ATK = 8;

/** 技能 CD 按槽位（tick），对齐 E11 定位表：烈斩 3s / 剑气 5s / 震地 4s / 破军 8s（combat §⑥ 3–8s）。 */
export const SKILL_CD_BY_SLOT = [
  SKILL_CD_MIN_TICKS, // 槽0 烈斩 = 3s（36 tick；playtest golden 锚点，勿改）
  Math.round(5 * TICK_RATE), // 槽1 剑气 = 5s（60 tick）
  Math.round(4 * TICK_RATE), // 槽2 震地 = 4s（48 tick）
  SKILL_CD_MAX_TICKS, // 槽3 破军 = 8s（96 tick）
] as const;

/** 技能基础伤害（pre-parry，按槽位区分定位；combat §⑥ 技能伤害 MVP 初值）。 */
export const SKILL_DAMAGE = [20, 28, 16, 36] as const;

/**
 * 技能命中半径按槽位（px），圆形范围（MVP；combat §⑥ castRange；E11 差异化）。
 * - 槽 0 = 1.5 tile（**保持现值 72px，playtest golden 锚点**）；
 * - 槽 1/2/3 从统一 1.5 tile 分化：2.5 / 2.0 / 1.8 tile（E11 定位：中距直线波 / 范围震击 / 重击爆发）。
 * 注：数值已按定位分化；槽 1「剑气」的直线波为 Phase-2 视觉表现，MVP 一律圆形范围结算
 * （几何差异在 world 技能结算注释中说明，见 world.ts）。
 */
export const SKILL_RANGE_BY_SLOT = [
  Math.round(1.5 * TILE), // 槽0 烈斩 = 72px（保持，golden 锚点）
  Math.round(2.5 * TILE), // 槽1 剑气 = 120px
  Math.round(2.0 * TILE), // 槽2 震地 = 96px
  Math.round(1.8 * TILE), // 槽3 破军 ≈ 86px
] as const;

/**
 * 技能命中半径（px）——兼容引用 = 槽 0 值（1.5 tile）。
 * E11 起单一来源为 SKILL_RANGE_BY_SLOT（C7）；本常量保留仅作旧引用兼容（= BY_SLOT[0]），
 * 新代码一律用 SKILL_RANGE_BY_SLOT[slot]。
 */
export const SKILL_RANGE = SKILL_RANGE_BY_SLOT[0];

/**
 * 技能中文名（客户端 HUD 显示；E11 差异化定位，C7 单一来源）。
 * 与 SKILL_DAMAGE / SKILL_RANGE_BY_SLOT / SKILL_CD_BY_SLOT 同槽位对齐（0..3）。
 */
export const SKILL_NAMES = ["烈斩", "剑气", "震地", "破军"] as const;

/**
 * 技能定位短描述（客户端 HUD 显示；E11）。
 * 槽位对齐 SKILL_NAMES；客户端 index.html 显示部分由并行任务按本表实现（服务端仅导出）。
 */
export const SKILL_DESCS = [
  "近战重击·高伤", // 槽0 烈斩：1.5 tile 近战主力，20 dmg / 3s
  "直线剑气·中距", // 槽1 剑气：2.5 tile 中距波，28 dmg / 5s
  "范围震击·群伤", // 槽2 震地：2.0 tile 范围震击，16 dmg / 4s
  "破军斩·爆发",   // 槽3 破军：1.8 tile 重击爆发，36 dmg / 8s
] as const;

/**
 * 敌人接触攻击**动作周期**（tick）= 1s @12Hz（combat §⑥ 敌人周期接触伤害）。
 * E18 起语义扩展：自「决策 tick」（敌人进入前摇的 tick）起算整周期 =
 * 前摇 ENEMY_WINDUP_TICKS（5，站立蓄力）+ 后摇 7（恢复/可再移动）——攻击频率不变
 * （1 击 / 12 tick），落刀点位于周期第 ENEMY_WINDUP_TICKS tick（决策 +5）。
 * BOSS phase2 用 BOSS_PHASE2_ATTACK_INTERVAL_TICKS（6）= 前摇 5 + 后摇 1。
 */
export const ENEMY_ATTACK_INTERVAL_TICKS = 12;

/**
 * 敌人攻击前摇（tick）= 0.4s @12Hz（E18，主理人拍板）。
 * 敌人决定攻击（目标在接触范围 + 间隔到）→ 置 EntityStatus.WINDUP + 记
 * windupUntilTick = t + ENEMY_WINDUP_TICKS → 前摇期间**不移动**（站立蓄力）→
 * windup 结束（t >= windupUntilTick）对「前摇锁定目标」落刀（目标走开 → 落空）。
 * 客户端读 WINDUP status 位画抬手表现（压低前倾 + 头部警示），攻击可读可躲。
 */
export const ENEMY_WINDUP_TICKS = 5;

/** 敌人接触攻击判定半径（px），相邻即攻击（= 1 tile）。 */
export const ENEMY_CONTACT_RANGE = TILE;

/** 玩家拾取半径（px），距离 < PICKUP_RADIUS 即拾取地面掉落（= 1 tile）。 */
export const PICKUP_RADIUS = TILE;

/** 刷怪散布半径（px），敌人在刷怪点附近确定性散布（= 1 tile）。 */
export const SPAWN_SCATTER_PX = TILE;

/** BOSS 阶段阈值（hp < maxHp * BOSS_PHASE_THRESHOLD → 进入 phase 2）。combat §⑥。 */
export const BOSS_PHASE_THRESHOLD = 0.5;

/** BOSS phase 2 攻击间隔（tick），比常规更快（combat §⑥ BOSS 阶段提升攻击频率）。 */
export const BOSS_PHASE2_ATTACK_INTERVAL_TICKS = 6;

/** 刷怪点默认复活 tick（30s @12Hz；spawning §⑥ 30–60s 取下限）。 */
export const DEFAULT_RESPAWN_TICKS = 30 * TICK_RATE;

/** 玩家死亡复活点（tile 对齐；persistence SAFE_SPAWN 同源，world 不复用 server 模块，C6）。 */
export const RESPAWN_POS = { x: 16 * TILE, y: 15 * TILE } as const;

/**
 * 玩家倒地时长（tick）。E10：hp≤0 → DOWNED → 倒地 10s 后自动复活回 RESPAWN_POS。
 * 10s @12Hz = 120。C7 单一来源（world 复活计时 / 客户端倒计时镜像）。
 */
export const DOWNED_TICKS = 10 * TICK_RATE;

/**
 * 复活后无敌帧（tick）。E10：复活回城后 3s 内 IFRAME（敌人接触攻击无效，防围杀）。
 * 3s @12Hz = 36。C7 单一来源（world IFRAME 到期清位 / 客户端闪烁镜像）。
 */
export const REVIVE_IFRAME_TICKS = 3 * TICK_RATE;

/** 稀有度名称顺序（索引 0=白/1=蓝/2=金/3=暗金），与 AFFIX_COUNTS / EntityState.LootState.rarity / InventoryItem.rarity 对齐。 */
export const RARITY_NAMES = ["white", "blue", "gold", "darkgold"] as const;

/** 稀有度权重 [白,蓝,金,暗金]，按 tier（normal/elite/boss）；loot §⑥。 */
export const RARITY_WEIGHTS_BY_TIER = {
  normal: [60, 30, 9, 1], // 白 60 / 蓝 30 / 金 9 / 暗金 1
  elite: [0, 40, 45, 15], // 蓝 40 / 金 45 / 暗金 15
  boss: [0, 0, 55, 45], // 金 55 / 暗金 45（暗金显著提升）
} as const;

/** 词缀 id 池上限（rollLoot 选 1..AFFIX_ID_MAX）。loot §② 小池。 */
export const AFFIX_ID_MAX = 64;

// ─────────────────────────────────────────────────────────────
// 副本实例 seed（ADR-JH-ENG-03 §1·§3；C-Dgn-1）
// ─────────────────────────────────────────────────────────────

/**
 * 副本实例 seed（服务端权威）：hash(serverTick + entranceId + partyTag)。
 * - `serverTick` 客户端不可知 ⇒ seed 不可预测（抗篡改，C-Dgn-1）；
 * - `partyTag` 单人=自身 id，多人=首个触发者 id（dungeon §⑥）；
 * - 客户端永不接收原始 seed（仅收生成后的布局/实体）。
 *
 * 确定性：同三元组 ⇒ 同 seed ⇒ 同布局/同掉落（golden-test 守护，D9）。
 * 自包含 FNV-1a 64-bit 哈希，避免与 rng 模块形成循环依赖，保持本文件为纯常量源。
 */
function fnv1a64(s: string): bigint {
  const MASK = 0xffffffffffffffffn;
  let h = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * PRIME) & MASK;
  }
  return h;
}

export function instanceSeed(
  serverTick: number,
  entranceId: number,
  partyTag: number | string,
): bigint {
  return fnv1a64(`t:${serverTick}|e:${entranceId}|p:${partyTag}`);
}

// ─────────────────────────────────────────────────────────────
// 副本实例生命周期（ADR-JH-ENG-03 §3；C-Dgn-4 / C7 单一来源）
// ─────────────────────────────────────────────────────────────

/**
 * 入口冷却（tick）。10s @12Hz = 120。防刷本（dungeon §⑥ / C-Dgn-4）。
 * 由 world.tryEnterEntrance 在首次进入时激活（未激活 cooldownTicks=0 表示从未使用）。
 */
export const ENTRANCE_COOLDOWN_TICKS = 10 * TICK_RATE;

/**
 * 入口交互半径（px）= 1.5×TILE = 72px（E16，C7 单一来源）。
 * 进本交互半径，与拾取提示一致（客户端 L2「按 F 拾取」提示环同 1.5×TILE）。
 * E16 服务端入口坐标校验：玩家与 ENTRANCE 实体距离 ≤ 本值才允许 dungeon.enter
 * （之前仅客户端校验，任意位置可进本；服务端补权威闸门）。
 */
export const ENTRANCE_INTERACT_RADIUS = Math.round(1.5 * TILE);

/**
 * 副本实例寿命（ms）。30min（dungeon §⑥ / C-Dgn-4）。
 * 编排层（run-manager）以 wall-clock（Date.now）计时；sim-core 侧仅持有该量化常量（C7）。
 * 注：实例 tick 循环为固定步长（≈wall-clock/83.33ms），用 Date.now 计时更鲁棒（循环停滞不误判）。
 */
export const DUNGEON_EXPIRE_MS = 30 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// E13 多人同本：入口集合缓冲（ADR-JH-ENG-03 §3 扩展；C7 单一来源）
// ─────────────────────────────────────────────────────────────

/**
 * 入口集合窗口（tick）。5s @12Hz = 60（E13 · 主理人拍板）。
 * 首个成员进入后，窗口内同入口到达的其他成员加入同一 waiting 实例；窗口到期/满员 → 锁定开本。
 * **确定性（D9）**：窗口用 RESIDENT world tick 计时（run-manager 存 lockTick =
 * `创建时 RESIDENT world.tick + PARTY_GATHER_WINDOW_TICKS`），绝不用 Date.now（循环停滞不漂移）。
 */
export const PARTY_GATHER_WINDOW_TICKS = 5 * TICK_RATE;

/**
 * 同本成员上限（E13 · MVP）。waiting 实例 members 达上限 → 立即锁定开本（不等窗口）。
 * 单人秒开（窗口内无人加入即单人锁定开本，不强制组队）由 run-manager 的
 * lockTick/成员数双重判定表达（本常量仅承载数量上限）。
 */
export const PARTY_MAX_MEMBERS = 4;

/**
 * 副本内刷怪密度倍率（spawning.md §⑥）。
 * dungeonGen 在生成 SpawnZone 时按本倍率放大 count。
 * E6（用户试玩反馈③「副本里被围死」）：1.5 → 1.2 调低密度，配 count 区间 2..4 → 1..3，
 *   副本不再被围死（详见 dungeonGen §count 公式与 E6 报告）。
 */
export const DUNGEON_SPAWN_DENSITY = 1.2;

// ─────────────────────────────────────────────────────────────
// E19：装备强化（enchant；C7 单一来源）
// ─────────────────────────────────────────────────────────────

/**
 * 强化石物品 id（材料计数，非背包物品）。
 * 材料**不进 LootResult / 地面掉落实体**（独立于掉落 Rng 流 → playtest golden 稳），
 * 仅作为 Character.materials 计数由击杀事件驱动；本常量用于「强化石不可强化」防御校验
 * 与文档标识（掉落序列永不产生该 itemId 的背包物品——掉落 itemId 来自 rng 1..0x7fffffff）。
 */
export const ENCHANT_STONE_ITEM_ID = 900000;

/** 强化上限（+5；达到后拒绝强化）。 */
export const MAX_ENCHANT_LEVEL = 5;

/** 单次强化消耗强化石数（1 石/次，MVP 固定）。 */
export const ENCHANT_COST = 1;

/**
 * 每级词缀强度放大系数：词缀实际值 = affixValue(id,rarity) × (1 + ENCHANT_AFFIX_MULT_PER_LEVEL × level)。
 * 仅放大**词缀 value**（proto baseAtk/baseMaxHp 不放大）；computeEquipStats 消费（E19）。
 * 例：+5 暗金 atk 词缀 base=24 → 24×1.3×2.4? 否——affixValue 已含稀有度倍率（round(24×2.4)=58），
 * 强化再 ×(1+0.15×5)=×1.75 → round(58×1.75)=102。
 */
export const ENCHANT_AFFIX_MULT_PER_LEVEL = 0.15;

/** 精英/BOSS 击杀获得强化石数（普通怪 0；不依赖 Rng，固定必得 → 确定性）。 */
export const ENCHANT_STONES_BY_TIER: Readonly<Record<EnemyTier, number>> = {
  normal: 0,
  elite: 1,
  boss: 2,
} as const;

// ─────────────────────────────────────────────────────────────
// E20：BOSS 战利品宝箱（chest；C7 单一来源）
// ─────────────────────────────────────────────────────────────

/**
 * 宝箱存活时长（tick）= 5min @12Hz（E20 · 主理人拍板）。
 * BOSS 死亡在其位置刷「战利品宝箱」（EntityKind.CHEST），拾取/开箱前不消失；
 * 比普通地面掉落（LOOT_GROUND_TTL_TICKS=150s）更长——仪式正反馈窗口，开箱后消失。
 */
export const CHEST_TTL_TICKS = 5 * 60 * TICK_RATE;

/**
 * 开箱交互半径（px）= 1.5×TILE（E20）。
 * 客户端「按 F 开箱」提示环同半径（镜像 PICKUP_HINT_RADIUS / ENTRANCE_INTERACT_RADIUS）；
 * 服务端权威闸门：玩家与宝箱距离 ≤ 本值才允许 INTERACT 开箱（C11）。
 */
export const CHEST_OPEN_RADIUS = Math.round(1.5 * TILE);

/** 开箱掉落件数区间（3-5 件装备；E20 · 主理人拍板）。 */
export const CHEST_ITEM_COUNT_MIN = 3;
export const CHEST_ITEM_COUNT_MAX = 5;

/**
 * 开箱强化石数（×2；E20 · 主理人拍板）。
 * 复用 E19 材料计数通道（Character.materials / character.inventory.materials）；
 * 与 E19 BOSS 击杀强化石数同源（C7 单一来源）——BOSS 战奖励仪式化后开箱仍给同量材料。
 */
export const CHEST_STONES = ENCHANT_STONES_BY_TIER.boss;

// ─────────────────────────────────────────────────────────────
// E21：药水 / 消耗品（potion；C7 单一来源）
// ─────────────────────────────────────────────────────────────

/**
 * 疗伤药回血比例（× 当前 maxHp）。E21 · 主理人拍板：回 30% maxHp。
 * 生效公式（world.usePotion 服务端权威）：hp = min(maxHp, hp + round(maxHp × 本值))。
 * 暗黑式「喝红瓶」生存核心：唯一玩家主动回血手段（无被动回血 / 无其它消耗品）。
 */
export const POTION_HEAL_RATIO = 0.3;

/**
 * 药水使用冷却（tick）= 5s @12Hz。
 * world actor.lastPotionTick 记录上次使用 tick；`nowTick - lastPotionTick >= 本值` 才可再用。
 * 客户端 CD 环/数字按本值推算（C7 单一来源镜像）。
 */
export const POTION_CD_TICKS = 5 * TICK_RATE;

/**
 * 普通怪击杀药水掉落概率（10%）。
 * **独立 Rng 流**（`new Rng('potion:' + seed + ':' + tick + ':' + enemyId)`，每次击杀新建实例）——
 * 零状态、不消耗 simRng → 不扰动掉落/暴击 Rng 流 → playtest golden 稳定（D9）。
 */
export const POTION_DROP_NORMAL_CHANCE = 0.1;

/**
 * 击杀药水数按敌人 tier（普通怪 0 → 走 POTION_DROP_NORMAL_CHANCE 概率；精英/BOSS 固定必得）。
 * 复用 E19 ENCHANT_STONES_BY_TIER「材料计数」模式：固定必得、不依赖掉落 Rng 流、
 * **不进 EntityState 快照**（C12）→ 不污染 playtest golden（journal 无药水字段，掉装不变）。
 */
export const POTIONS_BY_TIER: Readonly<Record<EnemyTier, number>> = {
  normal: 0,
  elite: 1,
  boss: 2,
} as const;

// ─────────────────────────────────────────────────────────────
// 敌人 AI（E6：敌人类别 + 仇恨；combat §⑥ / spawning §⑥）
// ─────────────────────────────────────────────────────────────

/** 敌人基础移动速度（格/s）。AI CHASE 追击速度（E6 建议 2 格/s）。 */
export const BASE_ENEMY_SPEED = 2;

/** 敌人每 tick 位移（格）= 2/12 ≈ 0.1667。AI CHASE 复用 stepMovement 纯积分。 */
export const ENEMY_MOVE_SPEED = BASE_ENEMY_SPEED / TICK_RATE;

/** 敌人仇恨半径（px）= 5 tile。aggressive 敌人在此半径内索敌追击（E6）。 */
export const AGGRO_RADIUS = 5 * TILE;

/**
 * 被动怪「被打才反击」的复仇窗口（tick）= 5s @12Hz（E6）。
 * 被动怪（tier 0 默认 passive）不主动攻击、不追击；仅在被打后的本窗口内对接触内玩家反击。
 */
export const PROVOKE_DURATION_TICKS = 5 * TICK_RATE;

/**
 * 敌人脱战回归到达容差（px）= 0.5×TILE（E16）。
 * aggressive 敌人目标离开 AGGRO_RADIUS 后朝出生点（spawnOrigin）移动，距出生点 ≤ 本值即停（IDLE）。
 * 与 TARGET_ARRIVE_TOL（玩家点击移动到达容差）同量纲；独立常量承载「敌人回归」语义（C7）。
 */
export const ENEMY_RETURN_ARRIVE_TOL = Math.round(0.5 * TILE);
