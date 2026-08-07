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

/** 普通怪基础 HP（spawning：enemyHp = ENEMY_BASE_HP * HP_MULT[tier]）。MVP 平衡初值（spawning §⑥ / combat §⑥）。 */
export const ENEMY_BASE_HP = 30;

/** 普通怪接触伤害基础（enemyContact = ENEMY_BASE_ATK * HP_MULT[tier]）。MVP 平衡初值（combat §⑥ 敌人接触伤害）。 */
export const ENEMY_BASE_ATK = 8;

/** 技能 CD 按槽位（tick），在 [SKILL_CD_MIN_TICKS, SKILL_CD_MAX_TICKS] 内按定位递增（combat §⑥ 3–8s）。 */
export const SKILL_CD_BY_SLOT = [
  SKILL_CD_MIN_TICKS, // 槽0 = 3s
  Math.round((SKILL_CD_MIN_TICKS + SKILL_CD_MAX_TICKS) / 2 - 10), // 槽1 ≈ 5.6s
  Math.round((SKILL_CD_MIN_TICKS + SKILL_CD_MAX_TICKS) / 2 + 10), // 槽2 ≈ 7.6s
  SKILL_CD_MAX_TICKS, // 槽3 = 8s
] as const;

/** 技能基础伤害（pre-parry，按槽位区分定位；combat §⑥ 技能伤害 MVP 初值）。 */
export const SKILL_DAMAGE = [20, 28, 16, 36] as const;

/** 技能命中半径（px），圆形范围（MVP；combat §⑥ castRange）。1.5 tile。 */
export const SKILL_RANGE = Math.round(1.5 * TILE);

/** 敌人接触攻击间隔（tick）= 1s @12Hz（combat §⑥ 敌人周期接触伤害）。 */
export const ENEMY_ATTACK_INTERVAL_TICKS = 12;

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
 * 副本实例寿命（ms）。30min（dungeon §⑥ / C-Dgn-4）。
 * 编排层（run-manager）以 wall-clock（Date.now）计时；sim-core 侧仅持有该量化常量（C7）。
 * 注：实例 tick 循环为固定步长（≈wall-clock/83.33ms），用 Date.now 计时更鲁棒（循环停滞不误判）。
 */
export const DUNGEON_EXPIRE_MS = 30 * 60 * 1000;

/**
 * 副本内刷怪密度倍率（spawning.md §⑥）。
 * dungeonGen 在生成 SpawnZone 时按本倍率放大 count。
 * E6（用户试玩反馈③「副本里被围死」）：1.5 → 1.2 调低密度，配 count 区间 2..4 → 1..3，
 *   副本不再被围死（详见 dungeonGen §count 公式与 E6 报告）。
 */
export const DUNGEON_SPAWN_DENSITY = 1.2;

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
