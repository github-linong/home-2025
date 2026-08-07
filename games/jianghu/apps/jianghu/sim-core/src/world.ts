/**
 * world.ts — 权威世界（E4 联调：刷怪 + 战斗 + 掉装 + 拾取；服务端权威，确定性可复现）
 * ===========================================================================
 * 本模块是 ① 编排层对权威状态的持有者（run-runtime 每 tick 调用 world.step / world.snapshot）。
 *
 * E4 范围（在 E3 真移动之上联调）：
 *   - 刷怪：createWorld 接受 spawnZones（自定 SpawnZone，不依赖 dungeonGen/E5），构造时
 *     spawnWave 实例化敌人；world 持有 spawnStates 维护复活计时。
 *   - 输入路由：enqueueInput 缓冲每 seat 最新指令（含 MOVE/PARRY/SKILL），step 按 action 分发。
 *   - 战斗：敌人→玩家周期性接触伤害（含 parry 校验）；玩家 SKILL→范围内敌人结算（服务端权威）。
 *   - 死亡/掉装：敌人 hp≤0 → rollLoot →  spawn LOOT_GROUND（ttlTicks）→ 移除；zone 清空→复活计时。
 *   - 拾取：玩家与 LOOT_GROUND 重叠 → 记录 PickupEvent，移除地面 token；consumePickups/onPickup 暴露。
 *   - BOSS 阶段：hp 跨阈值 → bossPhase 改变（提升攻击频率）。
 *   - E15：BOSS phase2 AOE telegraph 预警（生成 TELEGRAPH 实体 → TELEGRAPH_TICKS 后落刀 +
 *     移除；纯 tick 驱动，无 Rng 消耗）与副本复活点可配置（respawnPos，缺省 RESPAWN_POS）。
 *   - E16：clearPlayerInput（断线清 pending/lastMove，防断线角色漂移）+ 敌人脱战回归出生点
 *     （aggressive 目标离开 AGGRO_RADIUS → 朝 spawnOrigin 移动，到达停；确定性无随机）。
 *   - E18：敌人攻击前摇（windup）——接触攻击改为「决策 → 前摇 ENEMY_WINDUP_TICKS（站立蓄力，
 *     不移动）→ 落刀/落空」。WINDUP status 位（1<<6）进快照供客户端画抬手；windupUntilTick /
 *     windupTargetId 仅 world 内部（C12：不进快照）。间隔语义：lastAttackTick 在决策 tick 记录，
 *     ENEMY_ATTACK_INTERVAL_TICKS 现为攻击动作周期（前摇 5 + 后摇 7）。玩家前摇期间走开 → 落空。
 *   - parry 窗口清理 / skillCd 递减。
 *
 * 纪律（C6 / C9 / C11 / C12 / D9）：
 *   - 本文件是 sim-core 内唯一编排点：运行时依赖 combat / spawning / loot / parry（均为 sim-core
 *     纯模块）；不依赖任何 server src（../src/...），spawning 不反向运行时依赖 loot。
 *   - step() 绝对禁止 Date.now() / Math.random()；所有随机走 Rng 实例 seed 流（D9）。
 *   - 玩家移动为确定性纯积分（stepMovement），同 seed + 同输入序列 ⇒ 同坐标序列。
 *   - 所有量化常量从 constants.ts 单一来源（C7）。
 *   - 新增序列化字段按现有条件序列化模式（C12）。
 *
 * 注：LOOT_GROUND 漂浮沿用 E1 占位 `0.333` 步长与 `40*TILE`/`30*TILE` 边界，以保持既有 golden
 * 确定性哈希稳定；E4 新增逻辑（敌人/战斗/掉装）在无刷怪区 + 无玩家时为空转，不改变占位实体。
 */

import {
  EntityKind,
  EntityStatus,
  RoomPhase,
  InputAction,
  type EntityState,
  type WorldSnapshot,
  type InputCmd,
  type RoomPhaseValue,
  type Vec2,
  type LootState,
} from "./types.ts";
import {
  TILE,
  CELLS_PER_TICK,
  PLAYER_MAX_HP,
  PLAYER_BASE_ATTRS,
  PLAYER_BASE_ATK,
  MELEE_RANGE, // E8：普攻命中半径（px）= 1×TILE
  ATTACK_CD_TICKS, // E8：普攻间隔（tick）= 0.5s
  TARGET_ARRIVE_TOL, // E8：点击移动到达容差（px）= 0.5×TILE
  ENEMY_ATTACK_INTERVAL_TICKS,
  ENEMY_CONTACT_RANGE,
  ENEMY_WINDUP_TICKS, // E18：敌人攻击前摇（tick）= 0.4s @12Hz
  PICKUP_RADIUS,
  BOSS_PHASE_THRESHOLD,
  BOSS_PHASE2_ATTACK_INTERVAL_TICKS,
  DEFAULT_RESPAWN_TICKS,
  RESPAWN_POS,
  DOWNED_TICKS, // E10：倒地时长（tick）→ 自动复活
  REVIVE_IFRAME_TICKS, // E10：复活无敌帧（tick）→ IFRAME 防围杀
  LOOT_GROUND_TTL_TICKS,
  ENEMY_BASE_ATK,
  ENTRANCE_COOLDOWN_TICKS, // E5：入口冷却（C-Dgn-4）
  ENEMY_MOVE_SPEED, // E6：敌人 CHASE 追击速度（格/tick）
  AGGRO_RADIUS, // E6：敌人仇恨半径（px）
  PROVOKE_DURATION_TICKS, // E6：被动怪被打后的反击窗口（tick）
  ENEMY_RETURN_ARRIVE_TOL, // E16：敌人脱战回归到达容差（px）= 0.5×TILE
  TELEGRAPH_TICKS, // E15：telegraph 前摇（tick）= 1s @12Hz（D2 落地）
  TELEGRAPH_RADIUS, // E15：BOSS AOE 警示圈半径（px）= 1.5×TILE
  BOSS_AOE_INTERVAL_TICKS, // E15：BOSS phase2 AOE 预警间隔（tick）= 3s @12Hz
  BOSS_AOE_DAMAGE_MULT, // E15：BOSS AOE 伤害倍率（× 敌人攻击力）
  xpForLevel, // E9：升级经验需求（XP_req = 50·L^1.5，单一来源公式）
  ENEMY_XP, // E9：击杀经验表（按 EnemyTier 索引）
  LEVEL_ATK_PER_LEVEL, // E9：每级 +1 基础攻击（str→atk MVP 映射）
  LEVEL_MAXHP_PER_LEVEL, // E9：每级 +5 生命上限（vit→maxHp MVP 映射）
} from "./constants.ts"; // C7 单一来源
import { Rng } from "./rng.ts";
import { stepMovement } from "./movement.ts"; // E3 真移动（纯函数）
import { resolveDamage, resolveSkill } from "./combat.ts"; // E4 服务端权威结算
import { spawnWave, nextRespawnTick, type SpawnZone, type Aggression } from "./spawning.ts"; // E4 确定性实例化 / E6 敌人类别
import { rollLoot } from "./loot.ts"; // E4 掉落
import { computeEquipStats, EMPTY_EQUIP_STATS, type EquippedSlots, type EquipmentStats } from "./affixes.ts"; // E7 装备属性（纯数据）
import { openParryWindow } from "./parry.ts"; // E4 格挡窗口
import type { LootResult } from "./loot.ts";

export interface PlayerSeat {
  readonly seatId: number;
  readonly userId: string;
}

export interface CreateWorldOpts {
  readonly runId: string;
  readonly roomId: string;
  readonly seed: string;
  readonly phase: RoomPhaseValue;
  /** 构造时占位玩家（E1 兼容；E3 起通常由 addPlayer 动态加入）。 */
  readonly players?: readonly PlayerSeat[];
  /** 占位实体数量（LOOT_GROUND 漂浮 token，用于演示广播占位状态）。 */
  readonly lootTokens?: number;
  /** 世界尺寸（px），默认 40*TILE × 30*TILE，与 LOOT_GROUND clamp 一致。 */
  readonly bounds?: { readonly w: number; readonly h: number };
  /** 占用格集合，"x,y"（grid 坐标）字符串键，默认空。 */
  readonly blocked?: ReadonlySet<string>;
  /** E4 刷怪区（自定 SpawnZone，不依赖 dungeonGen/E5）。构造时 spawnWave 实例化敌人。 */
  readonly spawnZones?: readonly SpawnZone[];
  /**
   * E15：玩家死亡复活点（px，tile 对齐）。缺省 RESPAWN_POS（主世界不变，golden 稳定）。
   * 副本 instance world 由 run-manager 传 spec.entryTile（进本落点一致，防复活卡墙/出副本）。
   */
  readonly respawnPos?: Vec2;
}

/** 拾取事件（地面掉落被玩家拾取）。 */
export interface PickupEvent {
  readonly seatId: number;
  readonly loot: LootResult;
}

/** E9：升级事件（world → 编排层；升级时推送 character.level + 落库）。 */
export interface LevelUpEvent {
  readonly seatId: number;
  /** 升级后等级。 */
  readonly level: number;
  /** 当前剩余经验（扣减升级阈值后；持久化 exp 同源）。 */
  readonly xp: number;
  /** 下一级所需经验（xpForLevel(level)；消息 character.level.xpNext）。 */
  readonly xpNext: number;
}

interface Actor {
  id: number;
  kind: number;
  x: number;
  y: number;
  dir: number;
  hp: number;
  maxHp: number;
  status: number;
  // 条件字段
  ownerId?: number; // 玩家座位/角色 id
  loot?: { itemId: number; rarity: number; affixes: number[]; ttlTicks: number };
  entrance?: { cooldownTicks: number; lastUsedTick: number };
  // E4 新增（条件）
  tier?: number; // 0=normal 1=elite 2=boss（敌人）
  atk?: number; // 敌人接触伤害
  parryState?: { active: boolean; windowEndTick: number };
  skillCd?: number[]; // [4] 玩家技能 CD（tick 左）
  zoneIndex?: number; // 敌人所属 spawn zone（复活用）
  bossPhase?: number; // BOSS 阶段（0/1）
  lastAttackTick?: number; // 敌人上次接触攻击 tick（攻击节奏）
  // E6 新增（敌人 AI）
  aggression?: Aggression; // 敌人类别（passive / aggressive；spawnWave 透传或按 tier 缺省）
  lastDamageTick?: number; // 被动怪被打的最后 tick（反击窗口判定）
  // E16 新增（脱战回归）：敌人出生点（spawnWave/复活时记录的实例化 pos，含散布；E16 脱战后回归用）
  spawnOrigin?: Vec2;
  // E7 新增（玩家装备）
  equipped?: EquippedSlots; // 3 槽装备（持久化镜像；仅玩家实体持有）
  equipStats?: EquipmentStats; // 装备汇总属性缓存（computeEquipStats；仅在 addPlayer/setPlayerEquipped 时计算，热路径零分配）
  // E8 新增（玩家普攻）
  attackCdTicks?: number; // 玩家普攻 CD（tick 左；仅普攻使用后持有，未普攻 → undefined 保持 golden 稳定）
  // E9 新增（升级/经验；**不进 EntityState 快照**，C12 纪律，防污染确定性 journal）
  lastDamagerSeatId?: number; // 敌人：最后对目标造成伤害的玩家 seatId（击杀者归属，world 结算时写）
  level?: number; // 玩家等级（L1 默认；L1 全零加成，golden 锚点）
  xp?: number; // 玩家当前经验（击杀累计；会话内权威，升级时与持久化同步）
  levelStats?: { atk: number; maxHp: number }; // 等级派生属性缓存（复用 equipStats 思路；仅 addPlayer/升级时计算）
  // E10 新增（玩家倒地/复活；**不进 EntityState 快照**，C12 纪律——客户端用固定 DOWNED_TICKS 推算倒计时）
  downedAtTick?: number; // 玩家倒地起始 tick（复活计时；仅 world 内部）
  iframesUntilTick?: number; // 复活无敌帧截止 tick（IFRAME 到期清位；仅 world 内部）
  // E15 新增（telegraph 预警；C12 条件序列化——仅 telegraph 字段进快照，dmg/lastAoeTick 仅 world 内部）
  telegraph?: { shape: number; color: number; startTick: number; applyTick: number; radius: number };
  dmg?: number; // telegraph 落刀伤害（生成时由 BOSS atk × BOSS_AOE_DAMAGE_MULT 计算；不进快照）
  lastAoeTick?: number; // BOSS AOE 预警节流（上次生成 telegraph 的 tick；仅 world 内部）
  // E18 新增（敌人攻击前摇；**不进 EntityState 快照**，C12 纪律——客户端用 WINDUP status 位表现抬手）
  windupUntilTick?: number; // 前摇截止 tick（t >= 本值落刀；仅 world 内部）
  windupTargetId?: number; // 前摇锁定目标 actor id（落刀时判定是否仍在接触范围；仅 world 内部）
}

interface SpawnZoneRuntime {
  zone: SpawnZone;
  aliveIds: number[];
  respawnAtTick: number | null; // null = 无待复活
}

export interface World {
  readonly runId: string;
  readonly roomId: string;
  readonly seed: string;
  tick: number;
  phase: RoomPhaseValue;
  /** 在权威世界 spawn 一个玩家实体（幂等：重复 seatId 不叠加）。E7：equipped 可选（持久化镜像）。E9：level 可选（持久化镜像）。 */
  addPlayer(seatId: number, userId: string, spawn?: Vec2, equipped?: EquippedSlots, level?: number): void;
  /** 从权威世界移除一个玩家实体（进本时出主世界 / 测试清理；幂等：不存在则忽略）。 */
  removePlayer(seatId: number): void;
  /**
   * 尝试触发入口（副本大门）：服务端权威冷却闸门（C-Dgn-4）。
   * - 未激活（cooldownTicks=0）→ 首次触发放行并激活冷却（cooldownTicks=ENTRANCE_COOLDOWN_TICKS）；
   * - 已激活且 `nowTick - lastUsedTick < cooldownTicks` → 拒绝（防刷本）；
   * - 放行时更新 lastUsedTick（客户端经快照可见入口冷却状态）。
   */
  tryEnterEntrance(nowTick: number): boolean;
  /** 入队一条玩家输入（E4：缓冲 MOVE/PARRY/SKILL 最新指令；C11 seq 单调；STOP 清 lastMove 立即停）。 */
  enqueueInput(seatId: number, cmd: InputCmd): void;
  /**
   * E16：玩家断线时清空该 seat 的输入续行状态（pending + lastMove）。
   * - 效果：step 不再续行（断线角色立即停，不再沿最后方向漂移）；**不动 actor 坐标/hp/等级**。
   * - lastSeq **保留**（重连后 seq 仍单调，C11 防重放语义不变）；
   * - 幂等：未注册 seat / 无待清输入 → 无副作用。
   */
  clearPlayerInput(seatId: number): void;
  /** 推进一个权威 tick（确定性：刷怪/战斗/掉装/拾取/漂浮 + 玩家权威移动）。 */
  step(): void;
  /** 取当前权威快照。 */
  snapshot(): WorldSnapshot;
  /** 只读 actor 视图（测试/调试用）。 */
  actors(): readonly Actor[];
  /** 取出并清空拾取事件缓冲（服务端应用背包用）。 */
  consumePickups(): PickupEvent[];
  /** E9：取出并清空升级事件缓冲（服务端落库 + 推送 character.level 用）。 */
  consumeLevelUps(): LevelUpEvent[];
  /** 在指定 seat 玩家脚下生成地面掉落实体（背包满溢出回落，C-Per-3）。 */
  spawnGroundLoot(seatId: number, loot: LootState): void;
  /**
   * E7：应用玩家装备到权威世界 actor（换装/卸下后由服务端调用）。
   * - 更新 actor.equipped + equipStats（重算 maxHp/attrs）；
   * - hp 随 maxHp 差值同步（装 +maxHp 装备不亏血；卸下时 clamp 到新上限）；
   * - 未注册 seat / 无 actor → 幂等忽略。
   */
  setPlayerEquipped(seatId: number, equipped: EquippedSlots): void;
  /** 可选：每次拾取即时回调（run-manager 可设，替代轮询 consumePickups）。 */
  onPickup?: (seatId: number, loot: LootResult) => void;
  /** E9：可选：每次升级即时回调（run-manager 可设，替代轮询 consumeLevelUps）。 */
  onLevelUp?: (seatId: number, level: number, xp: number, xpNext: number) => void;
}

/**
 * 8 向 → 单位向量（世界坐标 x右/y下）。0=E(→+x)，顺时针：
 * 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE。确定性可复现（Math.SQRT1_2 精确归一化）。
 * 注：仅 LOOT_GROUND 占位漂浮使用；玩家移动经由 movement.stepMovement（同定义）。
 */
const DIR_UNIT_VECTORS: readonly { x: number; y: number }[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

function dirToVector(dir: number): { x: number; y: number } {
  const k = ((Math.trunc(dir) % 8) + 8) % 8;
  return DIR_UNIT_VECTORS[k];
}

/**
 * E6：从 (ax,ay) 指向 (bx,by) 的 8 向朝向（确定性；x右/y下，E=0° 顺时针 45° 步进）。
 * 用 atan2 归一化到最近 45°，纯数学无随机（D9）。AI CHASE 用。
 */
function dirToward(ax: number, ay: number, bx: number, by: number): number {
  const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI; // -180..180
  const k = Math.round(deg / 45);
  return ((k % 8) + 8) % 8;
}

// ─────────────────────────────────────────────────────────────
// E8：目标格编解码（InputCmd.targetTile u16；客户端点击移动/点选敌人共用）
// ─────────────────────────────────────────────────────────────
// 世界 40×30 格：gx ∈ [0,39], gy ∈ [0,29]。
// pack = gx*64 + gy（gx 高 6 位，gy 低 6 位，u16 安全：max = 39*64+29 = 2525）。
// 确定性纯函数；客户端 index.html 镜像同一定义（C7 注释同步）。
export function packTile(gx: number, gy: number): number {
  return gx * 64 + gy;
}

export function unpackTile(t: number): { gx: number; gy: number } {
  const v = Math.max(0, Math.trunc(t));
  return { gx: Math.floor(v / 64), gy: v % 64 };
}

/** 目标格中心（px）。点击移动朝该点移动；到达判据 = 距中心 ≤ TARGET_ARRIVE_TOL。 */
export function tileCenter(t: number): { x: number; y: number } {
  const { gx, gy } = unpackTile(t);
  return { x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2 };
}

/** 敌人 tier 索引 → 名称（rollLoot 用）。 */
const TIER_NAMES = ["normal", "elite", "boss"] as const;

/**
 * E18：敌人攻击前摇（windup）—— 敌人「决定攻击」（目标在接触范围 + 攻击间隔到）→ 进入
 * WINDUP（置 EntityStatus.WINDUP 位 + 记 windupUntilTick/windupTargetId），伤害延迟到
 * 前摇结束（t >= windupUntilTick）由 resolveEnemyWindup 结算。
 *
 * 间隔语义（主理人拍板）：lastAttackTick 在**决策 tick** 记录，ENEMY_ATTACK_INTERVAL_TICKS
 * 现在指「攻击动作周期」（前摇 ENEMY_WINDUP_TICKS + 后摇 7）——攻击频率不变（1 击/12 tick），
 * 落刀点位于周期第 ENEMY_WINDUP_TICKS tick（决策 +5）。BOSS phase2 同理（前摇 5 + 后摇 1）。
 *
 * 与 E4 原逻辑一致：BOSS phase2 加快攻击间隔；周期由 lastAttackTick 节流。
 * 纯函数式地改写 e 状态（world.step 内调用；无随机无 Date.now，D9）。
 */
function maybeEnemyWindup(e: Actor, target: Actor, t: number): void {
  // E10：复活无敌帧内敌人不发起攻击（IFRAME 防围杀；落刀时还会复查一次）。
  if (target.status & EntityStatus.IFRAME) return;
  const phase2 = e.kind === EntityKind.BOSS && (e.bossPhase ?? 0) >= 1;
  const interval = phase2 ? BOSS_PHASE2_ATTACK_INTERVAL_TICKS : ENEMY_ATTACK_INTERVAL_TICKS;
  if (t - (e.lastAttackTick ?? -interval) >= interval) {
    // E18：进入前摇（WINDUP 位进快照，客户端画抬手蓄力）；伤害在前摇结束时结算。
    e.status |= EntityStatus.WINDUP;
    e.windupUntilTick = t + ENEMY_WINDUP_TICKS;
    e.windupTargetId = target.id;
    e.lastAttackTick = t; // 间隔自决策 tick 起算（整周期 = 前摇 5 + 后摇 7 = 12）
  }
}

/**
 * E18：前摇结算（落刀）。`t >= windupUntilTick` 时调用：
 *   - 对**前摇锁定目标** resolveDamage（含 parry 校验 / 装备减伤；目标 IFRAME 无效）；
 *   - 目标死亡 / 倒地 / 走出接触范围 → **落空**（伤害不结算，玩家可走位躲避「可读可躲」）；
 *   - 清 WINDUP 位 + 内部字段（windupUntilTick / windupTargetId）。
 * 纯函数式改写 e/target（world.step 内调用；无随机无 Date.now，D9）。
 */
function resolveEnemyWindup(e: Actor, target: Actor | null, t: number): void {
  e.windupUntilTick = undefined;
  e.windupTargetId = undefined;
  e.status &= ~EntityStatus.WINDUP;
  if (!target) return; // 锁定目标已消失（死亡/移除）→ 落空
  if (target.hp <= 0) return; // 目标死亡 → 落空
  if (target.status & (EntityStatus.DOWNED | EntityStatus.IFRAME)) return; // 倒地/无敌 → 落空
  if (Math.hypot(target.x - e.x, target.y - e.y) > ENEMY_CONTACT_RANGE) return; // 玩家走开 → 落空
  const dmg = resolveDamage({
    targetId: target.id,
    amount: 0, // C11：忽略客户端 amount
    tick: t,
    baseAmount: e.atk ?? ENEMY_BASE_ATK,
    targetParry: target.parryState, // 玩家格挡校验（落刀 tick 判定，前摇可读 → 可挡）
    // E7：玩家装备减伤（无装备 → 0 → 与原逻辑字节一致，golden 锚点）。
    targetReduction: target.equipStats?.reduction ?? 0,
  });
  target.hp += dmg.deltaHp;
}

/**
 * E9：等级派生属性缓存（每级 +1 atk / +5 maxHp；L1 → 全零，golden 锚点）。
 * - str→atk、vit→maxHp 为 MVP 简化映射（GDD §8.3-7 三系线性）；
 * - dex→暴击/攻速 属 Phase-2 预留（LEVEL_ATK/MAXHP 常量不承载 dex，说明见 constants.ts）。
 * 纯函数确定性（D9）：同 level ⇒ 同 levelStats。
 */
function levelStatsFor(level: number): { atk: number; maxHp: number } {
  const lv = Math.max(1, Math.trunc(level));
  return { atk: (lv - 1) * LEVEL_ATK_PER_LEVEL, maxHp: (lv - 1) * LEVEL_MAXHP_PER_LEVEL };
}

/**
 * E7：构造玩家 actor（addPlayer / 构造时占位玩家共用）。
 * - maxHp = PLAYER_MAX_HP + 装备 maxHp 加成 + 等级 maxHp 加成（无装备 L1 → 100，golden 锚点）；
 * - 缓存 equipStats（computeEquipStats 仅在此/换装时计算，热路径零分配）；
 * - 缓存 levelStats（E9；仅在此/升级时计算，热路径零分配）；
 * - spawn 缺省沿用 E1 占位公式（按 seatId 错开）。
 */
function makePlayerActor(opts: {
  id: number;
  seatId: number;
  spawn?: Vec2;
  equipped?: EquippedSlots;
  /** E9：玩家等级（缺省 L1；重连时经持久化播种，attrs 反映真实等级）。 */
  level?: number;
  /** 缺省出生点 x 是否做 %40 防越界（addPlayer 用；构造时占位玩家传 false 保持 E1 原值）。 */
  wrapX?: boolean;
}): Actor {
  const equipStats = computeEquipStats(opts.equipped);
  const levelStats = levelStatsFor(opts.level ?? 1);
  const lv = Math.max(1, Math.trunc(opts.level ?? 1));
  const maxHp = PLAYER_MAX_HP + equipStats.maxHp + levelStats.maxHp;
  const sx = opts.spawn
    ? opts.spawn.x
    : (opts.wrapX === false ? (16 + opts.seatId) * TILE : ((16 + opts.seatId) % 40) * TILE);
  const sy = opts.spawn ? opts.spawn.y : 15 * TILE;
  return {
    id: opts.id,
    kind: EntityKind.PLAYER,
    x: sx,
    y: sy,
    dir: 0,
    hp: maxHp,
    maxHp,
    status: EntityStatus.ALIVE,
    ownerId: opts.seatId,
    skillCd: [0, 0, 0, 0],
    equipped: opts.equipped,
    equipStats,
    level: lv,
    xp: 0,
    levelStats,
  };
}

/** E7：玩家快照 attrs（面板展示；STR/DEX/VIT 基础 + 每级三系各 1 + 装备派生 atk/maxHp/crit）。 */
function playerAttrs(
  stats: EquipmentStats,
  levelStats: { atk: number; maxHp: number } | undefined,
  level: number | undefined,
  maxHp: number,
): EntityState["attrs"] {
  const lv = Math.max(1, Math.trunc(level ?? 1));
  return {
    // GDD 三系属性：基础 5 + 每级 +1（L1 → 5/5/5，golden 锚点）。
    str: PLAYER_BASE_ATTRS.str + (lv - 1),
    dex: PLAYER_BASE_ATTRS.dex + (lv - 1),
    vit: PLAYER_BASE_ATTRS.vit + (lv - 1),
    // 战斗映射：基础攻击 + 装备 atk + 等级 atk（str→atk；L1 → PLAYER_BASE_ATK，golden 锚点）。
    atk: PLAYER_BASE_ATK + stats.atk + (levelStats?.atk ?? 0),
    maxHp,
    crit: Math.round(stats.critChance * 1000),
  };
}

export function createWorld(opts: CreateWorldOpts): World {
  let actors: Actor[] = [];
  let nextId = 1;

  // E15：玩家死亡复活点（缺省 RESPAWN_POS=主世界安全区；副本 world 由 run-manager 传 entryTile）。
  const respawnPos: Vec2 = opts.respawnPos ?? RESPAWN_POS;

  // ── 世界尺寸 / 占用格（碰撞只读）──
  const bounds = opts.bounds ?? { w: 40 * TILE, h: 30 * TILE };
  const blocked = opts.blocked ?? new Set<string>();
  /** 占用格判定：越界 或 blocked 含该格键 → 不可进入（只读）。 */
  const isBlocked = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x > bounds.w || y > bounds.h) return true;
    const gx = Math.floor(x / TILE);
    const gy = Math.floor(y / TILE);
    return blocked.has(`${gx},${gy}`);
  };

  // ── 每玩家状态（seatId 路由）──
  const players = new Map<number, number>(); // seatId → actorId
  const pending = new Map<number, InputCmd>(); // seatId → 本 tick 最新指令（含 PARRY/SKILL）
  const lastSeq = new Map<number, number>(); // seatId → 已处理最大 seq（C11 防重放/注入）
  const lastMove = new Map<number, InputCmd>(); // seatId → 保留的最后一条 MOVE（按住方向持续移动）

  // ── 拾取事件缓冲 ──
  const pickupBuffer: PickupEvent[] = [];
  // E9：升级事件缓冲（升级时 push，consumeLevelUps 取走）
  const levelUpBuffer: LevelUpEvent[] = [];

  // ── 确定性 Rng 实例（战斗/刷怪/掉装/复活共用种子流，D9）──
  const simRng = new Rng(`combat:${opts.seed}`);

  // ── 刷怪区运行态（复活计时）──
  const spawnStates: SpawnZoneRuntime[] = [];

  // 占位「入口」实体（静态，ENTRANCE）：主世界大图中央一处裂隙异象漩涡。
  actors.push({
    id: nextId++,
    kind: EntityKind.ENTRANCE,
    x: 20 * TILE,
    y: 15 * TILE,
    dir: 0,
    hp: 1,
    maxHp: 1,
    status: EntityStatus.ALIVE,
    entrance: { cooldownTicks: 0, lastUsedTick: 0 },
  });

  // 占位「地面掉落 token」（LOOT_GROUND）：用种子化 Rng 在地图内散布，step 时确定性漂浮。
  const lootCount = opts.lootTokens ?? 4;
  const lootRng = new Rng(`world:${opts.seed}:loot`);
  for (let i = 0; i < lootCount; i++) {
    const gx = lootRng.nextInt(2, 38);
    const gy = lootRng.nextInt(2, 28);
    actors.push({
      id: nextId++,
      kind: EntityKind.LOOT_GROUND,
      x: gx * TILE,
      y: gy * TILE,
      dir: 0,
      hp: 1,
      maxHp: 1,
      status: EntityStatus.ALIVE,
      loot: {
        itemId: lootRng.nextInt(1000, 9999),
        rarity: lootRng.nextInt(0, 3),
        affixes: [lootRng.nextInt(1, 64)],
        ttlTicks: lootRng.nextInt(600, 1800), // 50–150s @12Hz
      },
    });
  }

  // E4：刷怪区 → 确定性实例化敌人（无刷怪区时为空转）。
  if (opts.spawnZones) {
    for (const z of opts.spawnZones) {
      const result = spawnWave([z], simRng);
      const aliveIds: number[] = [];
      for (const spec of result.enemies) {
        const id = nextId++;
        actors.push({
          id,
          kind: spec.kind,
          x: spec.pos.x,
          y: spec.pos.y,
          dir: 0,
          hp: spec.hp,
          maxHp: spec.maxHp,
          status: EntityStatus.ALIVE,
          tier: spec.tier,
          atk: spec.atk,
          aggression: spec.aggression, // E6 敌人类别（passive / aggressive）
          zoneIndex: spawnStates.length,
          // E16：出生点（spawnWave 实例化 pos，含散布；脱战后回归用）。
          spawnOrigin: { x: spec.pos.x, y: spec.pos.y },
          lastAttackTick: -ENEMY_ATTACK_INTERVAL_TICKS,
        });
        aliveIds.push(id);
      }
      spawnStates.push({ zone: z, aliveIds, respawnAtTick: null });
    }
  }

  // 构造时占位玩家（E1 兼容）：注册进 players 以便 step 驱动。
  for (const p of opts.players ?? []) {
    const id = nextId++;
    actors.push(makePlayerActor({ id, seatId: p.seatId, wrapX: false }));
    players.set(p.seatId, id);
  }

  const world: World = {
    runId: opts.runId,
    roomId: opts.roomId,
    seed: opts.seed,
    tick: 0,
    phase: opts.phase,
    actors: () => actors.slice(),

    addPlayer(seatId: number, _userId: string, spawn?: Vec2, equipped?: EquippedSlots, level?: number) {
      // 幂等：重复加入不叠加实体（重连/重复 room.join 安全）。
      if (players.has(seatId)) return;
      const id = nextId++;
      // E7：equipped 可选（持久化镜像）；缺省 → 基础属性（maxHp=100，golden 锚点）。
      // E9：level 可选（持久化镜像）；缺省 → L1（全零加成，golden 锚点）。
      actors.push(makePlayerActor({ id, seatId, spawn, equipped, level, wrapX: true }));
      players.set(seatId, id);
    },

    removePlayer(seatId: number) {
      const actorId = players.get(seatId);
      if (actorId === undefined) return; // 幂等：不存在则忽略
      actors = actors.filter((a) => a.id !== actorId);
      players.delete(seatId);
      pending.delete(seatId);
      lastSeq.delete(seatId);
      lastMove.delete(seatId);
    },

    setPlayerEquipped(seatId: number, equipped: EquippedSlots) {
      const actorId = players.get(seatId);
      if (actorId === undefined) return; // 幂等：未注册 seat 忽略
      const a = actors.find((x) => x.id === actorId);
      if (!a) return;
      const stats = computeEquipStats(equipped);
      const oldMax = a.maxHp;
      // E9：maxHp = 基础 + 装备 + 等级（等级加成来自 levelStats 缓存，换装不变）。
      const newMax = PLAYER_MAX_HP + stats.maxHp + (a.levelStats?.maxHp ?? 0);
      a.equipped = equipped;
      a.equipStats = stats;
      a.maxHp = newMax;
      // 装 +maxHp 装备 → hp 同步抬升（不亏血）；卸下 → clamp 到新上限。
      a.hp = Math.max(1, Math.min(a.hp + (newMax - oldMax), newMax));
    },

    tryEnterEntrance(nowTick: number): boolean {
      const ent = actors.find((a) => a.kind === EntityKind.ENTRANCE);
      if (!ent?.entrance) return false;
      const st = ent.entrance;
      // 已激活冷却且仍在窗口内 → 拒绝（C-Dgn-4 防刷本）。
      if (st.cooldownTicks > 0 && nowTick - st.lastUsedTick < st.cooldownTicks) return false;
      // 首次进入激活冷却（10s），更新 lastUsedTick（快照下发可见）。
      st.cooldownTicks = ENTRANCE_COOLDOWN_TICKS;
      st.lastUsedTick = nowTick;
      return true;
    },

    enqueueInput(seatId: number, cmd: InputCmd) {
      // 未注册玩家（尚未加入房间）的输入忽略，防注入。
      if (!players.has(seatId)) return;
      // C11 seq 单调：回退/重复 seq 静默丢弃（记下 lastSeq）。STOP 也走同一 seq 计数。
      const last = lastSeq.get(seatId);
      if (last !== undefined && cmd.seq <= last) return;
      lastSeq.set(seatId, cmd.seq);
      // E10：倒地玩家输入全丢弃（MOVE/ATTACK/SKILL/PARRY/STOP 均无效），seq 仍单调推进。
      //   倒地不再续行：死亡时已清 pending/lastMove；此处拦截新输入（防起身前移动/攻击/格挡）。
      const downedActor = actors.find((x) => x.id === players.get(seatId));
      if (downedActor && (downedActor.status & EntityStatus.DOWNED)) return;
      // STOP：松开移动键 → 清 pending + lastMove，step 立即停（不再续行）。
      // 注意：STOP 不缓冲进 pending（自身无移动语义），只消费一个 seq 并清状态；
      // 之后同一 tick 再来的更高 seq 输入（如重新 MOVE）会正常覆盖。
      if (cmd.action === InputAction.STOP) {
        pending.delete(seatId);
        lastMove.delete(seatId);
        return;
      }
      // E4：缓冲最新指令（含 MOVE/PARRY/SKILL），供 step 按 action 分发。
      pending.set(seatId, cmd);
      // 保留最后一条 MOVE 支撑"按住方向持续移动"（PARRY/SKILL 不更新 lastMove）。
      if (cmd.action === InputAction.MOVE) lastMove.set(seatId, cmd);
    },

    clearPlayerInput(seatId: number) {
      // E16：断线清理输入续行状态（pending + lastMove）；不动 actor 坐标/hp/等级，lastSeq 保留。
      pending.delete(seatId);
      lastMove.delete(seatId);
    },

    step() {
      const t = world.tick;

      // (1) LOOT_GROUND 确定性漂浮（保留 E1 占位；D9 种子化 Rng，字节稳定）。
      const stepRng = new Rng(`step:${opts.seed}:${t}`);
      for (const a of actors) {
        if (a.kind !== EntityKind.LOOT_GROUND) continue;
        const dir = stepRng.nextInt(0, 7);
        const v = dirToVector(dir);
        const speed = 0.333; // CELLS_PER_TICK 占位（保持 E1 golden 哈希稳定；真实移动走 CELLS_PER_TICK）
        a.x += v.x * speed * TILE;
        a.y += v.y * speed * TILE;
        // 边界回弹（确定性 clamp）
        a.x = Math.max(0, Math.min(40 * TILE, a.x));
        a.y = Math.max(0, Math.min(30 * TILE, a.y));
        if (a.loot) a.loot.ttlTicks = Math.max(0, a.loot.ttlTicks - 1);
      }

      // (2) 玩家：skillCd 递减 + parry 窗口清理 + 输入分发（MOVE/PARRY/SKILL）。
      for (const [seatId, actorId] of players) {
        const a = actors.find((x) => x.id === actorId);
        if (!a) continue;
        // E7：装备汇总属性缓存（makePlayerActor/setPlayerEquipped 已算好，热路径零分配；防御回退共享冻结常量）。
        const pStats: EquipmentStats = a.equipStats ?? EMPTY_EQUIP_STATS;

        // skillCd 递减
        if (a.skillCd) {
          for (let i = 0; i < a.skillCd.length; i++) {
            if (a.skillCd[i] > 0) a.skillCd[i] -= 1;
          }
        }
        // E8：普攻 CD 递减（仅普攻使用后持有；未普攻 → undefined，golden 稳定）。
        if (a.attackCdTicks !== undefined && a.attackCdTicks > 0) a.attackCdTicks -= 1;

        // parry 窗口清理：windowEndTick < 当前 tick → 过期（清 PARRY_ACTIVE 位）。
        if (a.parryState && a.parryState.windowEndTick < t) {
          a.parryState = undefined;
          a.status &= ~EntityStatus.PARRY_ACTIVE;
        }
        // E10：复活无敌帧到期清位（IFRAME；tick 驱动确定性，无 Date.now/Math.random）。
        if (a.iframesUntilTick !== undefined && t >= a.iframesUntilTick) {
          a.iframesUntilTick = undefined;
          a.status &= ~EntityStatus.IFRAME;
        }

        const cmd = pending.get(seatId);
        pending.delete(seatId);

        if (cmd) {
          if (cmd.action === InputAction.MOVE) {
            if (cmd.targetTile !== undefined) {
              // E8：点击移动（MOVE 带 targetTile）。朝目标格中心移动；到达（≤ TARGET_ARRIVE_TOL）
              // 自动停止并清 lastMove（暗黑式点击移动）。受阻沿墙滑行复用 stepMovement（isBlocked）。
              const tc = tileCenter(cmd.targetTile);
              const dist = Math.hypot(tc.x - a.x, tc.y - a.y);
              if (dist <= TARGET_ARRIVE_TOL) {
                lastMove.delete(seatId); // 到达 → 停止（清续行，不再移动）
              } else {
                const dir = dirToward(a.x, a.y, tc.x, tc.y);
                const np = stepMovement(
                  { x: a.x, y: a.y },
                  dir,
                  { speedPerTick: CELLS_PER_TICK * (1 + pStats.moveSpeed), isBlocked },
                );
                a.x = np.x;
                a.y = np.y;
                a.dir = dir;
                lastMove.set(seatId, cmd); // 保留续行（无输入 tick 继续朝目标格）
              }
            } else {
              // E7：moveSpeed 提升移动速度（无装备 moveSpeed=0 → CELLS_PER_TICK*1.0 字节不变，golden 锚点）。
              // 无 targetTile 的 MOVE 保持「按住方向持续移动」语义（键盘 WASD 兼容）。
              const np = stepMovement(
                { x: a.x, y: a.y },
                cmd.dir,
                { speedPerTick: CELLS_PER_TICK * (1 + pStats.moveSpeed), isBlocked },
              );
              a.x = np.x;
              a.y = np.y;
              a.dir = cmd.dir; // 朝向总是更新（撞墙也转向）
              lastMove.set(seatId, cmd); // 保留最后一条 MOVE 支撑按住移动
            }
          } else if (cmd.action === InputAction.PARRY) {
            // 开 parry 窗口（服务端时间窗校验；R2b）。
            a.parryState = openParryWindow(t);
            a.status |= EntityStatus.PARRY_ACTIVE;
            // 格挡当 tick 不移动（lastMove 保留，下一 tick 无输入则继续移动）
          } else if (cmd.action >= InputAction.SKILL1 && cmd.action <= InputAction.SKILL4) {
            const slot = cmd.skillSlot ?? cmd.action - InputAction.SKILL1;
            // 仅当 skillCd 归零才可释放（C11 服务端权威 CD 闸门）。
            if (a.skillCd && a.skillCd[slot] <= 0) {
              const intent = resolveSkill(a.id, slot, t);
              // E7：玩家攻击 = 技能基础伤害 + 装备 atk（武器 baseAtk + atk 词缀）；无装备 → 原值（golden 锚点）。
              // E9：+ 等级 atk（每级 +1；L1 → 0 → 字节不变）。
              let baseAmount = intent.damage + pStats.atk + (a.levelStats?.atk ?? 0);
              // E7：暴击 ×1.5（D9 确定性 Rng；仅装备 critChance>0 时消耗 rng，无装备零消耗 → golden 稳定）。
              if (pStats.critChance > 0 && simRng.nextFloat() < pStats.critChance) {
                baseAmount = Math.round(baseAmount * 1.5);
              }
              // 对范围内敌人结算（圆形；敌人无格挡 → targetParry undefined）。
              // E11：intent.range 已按槽位差异化（SKILL_RANGE_BY_SLOT）——MVP 一律圆形范围判定，
              // 无需按槽区分几何；槽 1「剑气」的直线波为 Phase-2 视觉表现（数值 2.5 tile 已分化，几何暂以圆形近似）。
              for (const e of actors) {
                if (e.kind !== EntityKind.ENEMY && e.kind !== EntityKind.BOSS) continue;
                if (Math.hypot(e.x - a.x, e.y - a.y) <= intent.range) {
                  const dmg = resolveDamage({
                    targetId: e.id,
                    amount: 0, // C11：忽略客户端 amount，服务端按 baseAmount 裁决
                    tick: t,
                    baseAmount,
                    targetParry: undefined,
                  });
                  e.hp += dmg.deltaHp;
                  // E6：被动怪被打 → 记录反击窗口（被打才反击，窗口内对接触内玩家反击）。
                  e.lastDamageTick = t;
                  // E9：记录最后造成伤害的玩家 seatId（击杀者归属；world 结算时查该字段）。
                  e.lastDamagerSeatId = seatId;
                }
              }
              // E7：attackSpeed 缩短技能 CD（无装备 attackSpeed=0 → 原 cd，golden 锚点）。
              a.skillCd[slot] = Math.max(1, Math.round(intent.cdTicks * (1 - pStats.attackSpeed)));
            }
          } else if (cmd.action === InputAction.ATTACK) {
            // E8：普攻（服务端权威，C11 同技能模式）。校验：目标存在、敌人/BOSS、存活、
            // 距离 ≤ MELEE_RANGE（近战范围判定，不强制面向）、普攻 CD 到 → 结算。
            // 失败（目标不存在/死亡/范围外/CD 中）→ 静默忽略（不设 CD，客户端按范围重发）。
            const target = actors.find((x) => x.id === cmd.targetEntityId);
            if (
              target &&
              (target.kind === EntityKind.ENEMY || target.kind === EntityKind.BOSS) &&
              target.hp > 0 &&
              (a.attackCdTicks ?? 0) <= 0 &&
              Math.hypot(target.x - a.x, target.y - a.y) <= MELEE_RANGE
            ) {
              // E8：普攻伤害 = PLAYER_BASE_ATK + 装备 atk 加成；暴击复用既有门闸
              // （critChance>0 才消耗 Rng，无装备零消耗 → golden 稳定）。
              // E9：+ 等级 atk（每级 +1；L1 → 0 → 字节不变）。
              let baseAmount = PLAYER_BASE_ATK + pStats.atk + (a.levelStats?.atk ?? 0);
              if (pStats.critChance > 0 && simRng.nextFloat() < pStats.critChance) {
                baseAmount = Math.round(baseAmount * 1.5);
              }
              const dmg = resolveDamage({
                targetId: target.id,
                amount: 0,
                tick: t,
                baseAmount,
                targetParry: undefined, // 敌人无格挡
                targetReduction: undefined, // 敌人无装备减伤
              });
              target.hp += dmg.deltaHp;
              // E6：被动怪被打 → 反击窗口（同技能命中语义）。
              target.lastDamageTick = t;
              // E9：记录最后造成伤害的玩家 seatId（击杀者归属）。
              target.lastDamagerSeatId = seatId;
              // 面向目标（表现层：客户端挥砍光效朝目标；不参与命中判定，MVP 近战范围判定即可）。
              a.dir = dirToward(a.x, a.y, target.x, target.y);
              // E8：普攻 CD（attackSpeed 缩短；无装备 → ATTACK_CD_TICKS=6，golden 锚点）。
              a.attackCdTicks = Math.max(1, Math.round(ATTACK_CD_TICKS * (1 - pStats.attackSpeed)));
            }
          }
          // SIGNAL 等未识别 action → 忽略
        } else if (lastMove.has(seatId)) {
          // 无本 tick 输入 → 回退到保留的最后一条 MOVE（按住方向持续移动 / 点击移动续行 / 抗单 tick 丢包）。
          const mv = lastMove.get(seatId)!;
          if (mv.targetTile !== undefined) {
            // E8：点击移动续行 —— 朝目标格中心继续；到达自动停止（清 lastMove）。
            const tc = tileCenter(mv.targetTile);
            const dist = Math.hypot(tc.x - a.x, tc.y - a.y);
            if (dist <= TARGET_ARRIVE_TOL) {
              lastMove.delete(seatId);
            } else {
              const dir = dirToward(a.x, a.y, tc.x, tc.y);
              const np = stepMovement(
                { x: a.x, y: a.y },
                dir,
                { speedPerTick: CELLS_PER_TICK * (1 + pStats.moveSpeed), isBlocked },
              );
              a.x = np.x;
              a.y = np.y;
              a.dir = dir;
            }
          } else {
            const np = stepMovement(
              { x: a.x, y: a.y },
              mv.dir,
              { speedPerTick: CELLS_PER_TICK * (1 + pStats.moveSpeed), isBlocked },
            );
            a.x = np.x;
            a.y = np.y;
            a.dir = mv.dir;
          }
        }
      }

      // (3) 敌人 AI（E6）：索敌 → CHASE 追击（aggressive）→ WINDUP（E18 前摇）→ 落刀（含 parry 校验）。
      //     确定性纯逻辑：无随机、无 Date.now（D9）；玩家位置来自世界状态。
      //       · passive（默认普通怪 tier 0）：IDLE 完全静止（不做巡逻，保确定性 + 「站桩」被动怪）；
      //         仅被打后 PROVOKE_DURATION_TICKS 窗口内对接触内玩家反击（被打才反击）。
      //       · aggressive（精英 tier 1 / BOSS tier 2）：仇恨半径 AGGRO_RADIUS 内索敌追击
      //         （复用 stepMovement + isBlocked 滑行）；接触内停止追击改周期攻击；半径外 → IDLE。
      //       · E18 前摇：敌人在 WINDUP 期间**不移动**（站立蓄力），前摇结束（t >= windupUntilTick）
      //         对「前摇锁定目标」落刀（玩家走开 → 落空）；期间不索敌/不发 telegraph（正蓄力攻击）。
      for (const e of actors) {
        if (e.kind !== EntityKind.ENEMY && e.kind !== EntityKind.BOSS) continue;
        if (e.hp <= 0) continue;
        // E18：前摇结算放在索敌之前——即使玩家已走开/死亡，前摇也会按时落刀/落空，不会卡死 WINDUP 位。
        if (e.windupUntilTick !== undefined) {
          if (t >= e.windupUntilTick) {
            const locked =
              e.windupTargetId !== undefined ? actors.find((a) => a.id === e.windupTargetId) ?? null : null;
            resolveEnemyWindup(e, locked, t); // 落刀：锁定目标仍存活 + 仍在接触范围 → 结算；否则落空
          }
          continue; // 前摇期间不移动（站立蓄力）
        }
        // 目标选择：最近存活玩家（世界状态，确定性）。
        let target: Actor | null = null;
        let best = Infinity;
        for (const [, actorId] of players) {
          const p = actors.find((x) => x.id === actorId);
          if (!p || p.hp <= 0) continue;
          // E10：倒地玩家不参与索敌/接触攻击（已在 CHASE 的敌人目标归空 → IDLE 解除追击）。
          if (p.status & EntityStatus.DOWNED) continue;
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d < best) {
            best = d;
            target = p;
          }
        }
        if (!target) continue; // 无存活玩家 → IDLE（完全静止）

        const aggression = e.aggression ?? (e.tier === 0 ? "passive" : "aggressive");
        const inContact = best <= ENEMY_CONTACT_RANGE;

        // E15：BOSS phase2 AOE 预警（telegraph；D2 落地）。仅当 BOSS 处于「战斗态」
        // （目标在仇恨半径内，best 已由上方目标选择算出）且 bossPhase≥1（phase2）时，
        // 每 BOSS_AOE_INTERVAL_TICKS 在自身周围生成 AOE 警示圈（TELEGRAPH 实体）——
        // TELEGRAPH_TICKS 后由下方 telegraph 处理段对圈内玩家 resolveDamage（落刀）+ 移除。
        // 确定性：纯 tick 驱动，无 Rng 消耗（D9：不扰动掉落/暴击 Rng 流，golden 稳定）。
        if (
          e.kind === EntityKind.BOSS &&
          (e.bossPhase ?? 0) >= 1 &&
          best <= AGGRO_RADIUS &&
          t - (e.lastAoeTick ?? -BOSS_AOE_INTERVAL_TICKS) >= BOSS_AOE_INTERVAL_TICKS
        ) {
          actors.push({
            id: nextId++,
            kind: EntityKind.TELEGRAPH,
            x: e.x,
            y: e.y,
            dir: 0,
            hp: 1,
            maxHp: 1,
            status: EntityStatus.ALIVE,
            telegraph: {
              shape: 1, // AOE 填充（types.ts TelegraphState schema；0=圆环 1=AOE填充）
              color: 0, // DANGER（红；客户端 drawTelegraph color===1 才青色，0 红色）
              startTick: t,
              applyTick: t + TELEGRAPH_TICKS,
              radius: TELEGRAPH_RADIUS,
            },
            // 落刀伤害（生成时由 BOSS atk × BOSS_AOE_DAMAGE_MULT 计算，服务端权威 C11）。
            dmg: Math.round((e.atk ?? ENEMY_BASE_ATK) * BOSS_AOE_DAMAGE_MULT),
          });
          e.lastAoeTick = t;
        }

        if (aggression === "aggressive") {
          // aggressive：仇恨半径内索敌追击；接触内不移动（攻击）；半径外 → 脱战回归出生点（E16）。
          if (best <= AGGRO_RADIUS && !inContact) {
            const dir = dirToward(e.x, e.y, target.x, target.y);
            const np = stepMovement({ x: e.x, y: e.y }, dir, {
              speedPerTick: ENEMY_MOVE_SPEED, // E6：2 格/s = 0.1667 格/tick
              isBlocked,
            });
            e.x = np.x;
            e.y = np.y;
            e.dir = dir;
          } else if (best > AGGRO_RADIUS && e.spawnOrigin) {
            // E16：脱战回归 —— 目标离开仇恨半径 → 朝出生点移动；到达（≤ ENEMY_RETURN_ARRIVE_TOL）→ 停。
            // 确定性：纯 stepMovement 积分（D9，无随机/无 Date.now）；玩家不存在时 target=null → best=∞ → 同路径。
            const dx = e.spawnOrigin.x - e.x;
            const dy = e.spawnOrigin.y - e.y;
            if (Math.hypot(dx, dy) > ENEMY_RETURN_ARRIVE_TOL) {
              const dir = dirToward(e.x, e.y, e.spawnOrigin.x, e.spawnOrigin.y);
              const np = stepMovement({ x: e.x, y: e.y }, dir, {
                speedPerTick: ENEMY_MOVE_SPEED,
                isBlocked,
              });
              e.x = np.x;
              e.y = np.y;
              e.dir = dir;
            }
          }
          if (inContact) maybeEnemyWindup(e, target, t); // 接触内周期性攻击（E18：进入前摇，伤害延后结算）
        } else {
          // passive：不主动攻击、不追击（完全静止）；仅被打后的反击窗口内对接触内玩家反击。
          const provoked =
            e.lastDamageTick !== undefined && t - e.lastDamageTick <= PROVOKE_DURATION_TICKS;
          if (provoked && inContact) maybeEnemyWindup(e, target, t);
        }
      }

      // (3b) E15：telegraph 落刀 + 清理（applyTick 到点 → 对圈内玩家 resolveDamage + 移除实体）。
      //     地面 AOE 不可格挡（targetParry undefined）；复活无敌帧内不受（与接触攻击一致，防围杀）；
      //     DOWNED 玩家 hp=0 跳过（与敌人接触攻击一致）。确定性：无 Rng 消耗（D9）。
      const expiredTelegraph: number[] = [];
      for (const a of actors) {
        if (a.kind !== EntityKind.TELEGRAPH || !a.telegraph) continue;
        if (t >= a.telegraph.applyTick) {
          for (const [, actorId] of players) {
            const p = actors.find((x) => x.id === actorId);
            if (!p || p.hp <= 0) continue;
            if (p.status & EntityStatus.IFRAME) continue;
            if (Math.hypot(p.x - a.x, p.y - a.y) <= a.telegraph.radius) {
              const dmg = resolveDamage({
                targetId: p.id,
                amount: 0, // C11：忽略客户端 amount，服务端按 baseAmount 裁决
                tick: t,
                baseAmount: a.dmg ?? 0,
                targetParry: undefined, // 地面 AOE 不可格挡（parry 仅覆盖近战接触攻击）
                targetReduction: p.equipStats?.reduction ?? 0, // 装备减伤仍生效
              });
              p.hp += dmg.deltaHp;
            }
          }
          expiredTelegraph.push(a.id);
        }
      }
      if (expiredTelegraph.length > 0) actors = actors.filter((a) => !expiredTelegraph.includes(a.id));

      // (4) 死亡处理：玩家复活 / 敌人掉装 + 移除 + 复活调度。
      const deadEnemyIds = new Set<number>();
      for (const e of actors) {
        if ((e.kind === EntityKind.ENEMY || e.kind === EntityKind.BOSS) && e.hp <= 0) {
          deadEnemyIds.add(e.id);
        }
      }
      // E10 玩家死亡 → 倒地（DOWNED）：躺尸 → DOWNED_TICKS 后自动复活回 RESPAWN_POS。
      //   倒地期间（status 含 DOWNED）：输入全丢弃（enqueueInput 拦截）、敌人索敌/接触跳过
      //   （目标选择过滤）、不参与拾取（下方拾取循环过滤）、不掉装不送 xp（玩家非敌人实体，
      //   无击杀归属；决策④死亡不掉永久装备）。
      //   复活：hp = 当前 maxHp（含装备/等级加成）、回 RESPAWN_POS、清 DOWNED、置 IFRAME。
      //   副本内死亡同样回该 world 的 RESPAWN_POS（副本 world 用同一常量，见 constants.ts 说明）。
      for (const a of actors) {
        if (a.kind !== EntityKind.PLAYER) continue;
        if (a.hp <= 0 && !(a.status & EntityStatus.DOWNED)) {
          // 进入倒地：hp 归零、置 DOWNED、记倒地起始 tick、清 parry 与 seat 续行。
          a.hp = 0;
          a.status |= EntityStatus.DOWNED;
          a.downedAtTick = t;
          a.parryState = undefined;
          a.status &= ~EntityStatus.PARRY_ACTIVE;
          if (a.ownerId !== undefined) {
            pending.delete(a.ownerId);
            lastMove.delete(a.ownerId);
          }
        } else if (a.status & EntityStatus.DOWNED) {
          // 倒计时到 → 复活（tick 驱动，确定性）。
          const downedStart = a.downedAtTick ?? Number.POSITIVE_INFINITY;
          if (t >= downedStart + DOWNED_TICKS) {
            a.hp = a.maxHp; // 回满当前 maxHp（E7 装备 + E9 等级加成已并入 maxHp）
            // E15：复活回本 world 的 respawnPos（主世界 = RESPAWN_POS；副本 = entryTile，防卡墙/出副本）。
            a.x = respawnPos.x;
            a.y = respawnPos.y;
            a.status &= ~EntityStatus.DOWNED;
            a.status |= EntityStatus.IFRAME; // 复活 3s 无敌帧防围杀
            a.iframesUntilTick = t + REVIVE_IFRAME_TICKS;
            a.downedAtTick = undefined; // 清理（不进快照）
          }
        }
      }
      if (deadEnemyIds.size > 0) {
        for (const e of actors) {
          if (!deadEnemyIds.has(e.id)) continue;
          // E9：击杀者 = 最后对目标造成伤害的玩家（lastDamagerSeatId，world 结算时写）。
          //   xp += ENEMY_XP[tier]；while 循环可连升多级（C7 确定性）。
          //   升级 → 属性成长（+1 atk/+5 maxHp）→ hp 回满 → 升级事件（编排层推送/落库）。
          //   注：本段不消费 simRng（rollLoot 在下方），插入不影响掉落 Rng 流 → golden 稳定。
          const killerSeat = e.lastDamagerSeatId;
          if (killerSeat !== undefined) {
            const killerId = players.get(killerSeat);
            const killer = killerId !== undefined ? actors.find((x) => x.id === killerId) : undefined;
            if (killer && killer.hp > 0) {
              const tierName = TIER_NAMES[e.tier ?? 0];
              let xp = (killer.xp ?? 0) + ENEMY_XP[tierName];
              let level = killer.level ?? 1;
              let leveled = false;
              while (xp >= xpForLevel(level)) {
                xp -= xpForLevel(level);
                level += 1;
                leveled = true;
              }
              killer.xp = xp; // 未升级也累计（会话内权威，升级时与持久化同步）
              if (leveled) {
                killer.level = level;
                killer.levelStats = levelStatsFor(level);
                // 属性成长后 maxHp 提升 + 升级瞬间 hp 回满（同步到新上限）。
                const newMax = PLAYER_MAX_HP + (killer.equipStats?.maxHp ?? 0) + killer.levelStats.maxHp;
                killer.maxHp = newMax;
                killer.hp = newMax;
                const ev: LevelUpEvent = { seatId: killerSeat, level, xp, xpNext: xpForLevel(level) };
                levelUpBuffer.push(ev);
                if (world.onLevelUp) world.onLevelUp(ev.seatId, ev.level, ev.xp, ev.xpNext);
              }
            }
          }
          // 掉装：rollLoot（确定性 Rng 流）；命中 → spawn LOOT_GROUND 于敌人 pos。
          const tierName = TIER_NAMES[e.tier ?? 0];
          const res = rollLoot(simRng, tierName);
          if (res) {
            actors.push({
              id: nextId++,
              kind: EntityKind.LOOT_GROUND,
              x: e.x,
              y: e.y,
              dir: 0,
              hp: 1,
              maxHp: 1,
              status: EntityStatus.ALIVE,
              loot: {
                itemId: res.itemId,
                rarity: res.rarity,
                affixes: res.affixes.slice(),
                ttlTicks: LOOT_GROUND_TTL_TICKS,
              },
            });
          }
          // 更新所属刷怪区：alive 列表移除；清空则调度复活。
          if (e.zoneIndex !== undefined) {
            const st = spawnStates[e.zoneIndex];
            if (st) {
              st.aliveIds = st.aliveIds.filter((id) => id !== e.id);
              if (st.aliveIds.length === 0 && st.respawnAtTick === null) {
                st.respawnAtTick = nextRespawnTick(t, st.zone);
              }
            }
          }
        }
        actors = actors.filter((a) => !deadEnemyIds.has(a.id));
      }

      // (5) 复活调度：到点从同 zone 重生（确定性：重生用 simRng 种子流）。
      for (let zi = 0; zi < spawnStates.length; zi++) {
        const st = spawnStates[zi];
        if (st.respawnAtTick !== null && t >= st.respawnAtTick) {
          const result = spawnWave([st.zone], simRng);
          for (const spec of result.enemies) {
            const id = nextId++;
            actors.push({
              id,
              kind: spec.kind,
              x: spec.pos.x,
              y: spec.pos.y,
              dir: 0,
              hp: spec.hp,
              maxHp: spec.maxHp,
              status: EntityStatus.ALIVE,
              tier: spec.tier,
              atk: spec.atk,
              aggression: spec.aggression, // E6 敌人类别（passive / aggressive）
              zoneIndex: zi,
              // E16：出生点（复活实例化 pos，含散布；脱战后回归用）。
              spawnOrigin: { x: spec.pos.x, y: spec.pos.y },
              lastAttackTick: t - ENEMY_ATTACK_INTERVAL_TICKS,
            });
            st.aliveIds.push(id);
          }
          st.respawnAtTick = null;
        }
      }

      // (6) LOOT_GROUND ttl 倒计时 + 拾取（ttl 已在漂浮循环递减）。
      const removeLoot: number[] = [];
      for (const a of actors) {
        if (a.kind !== EntityKind.LOOT_GROUND || !a.loot) continue;
        if (a.loot.ttlTicks <= 0) {
          removeLoot.push(a.id);
          continue;
        }
        // 拾取：任意玩家在 PICKUP_RADIUS 内 → 记录 + 移除。
        for (const [, actorId] of players) {
          const p = actors.find((x) => x.id === actorId);
          if (!p) continue;
          // E10：倒地玩家不参与拾取（躺尸不捡装备）。
          if (p.status & EntityStatus.DOWNED) continue;
          if (Math.hypot(p.x - a.x, p.y - a.y) < PICKUP_RADIUS) {
            const loot: LootResult = {
              itemId: a.loot.itemId,
              rarity: a.loot.rarity,
              affixes: a.loot.affixes.slice(),
            };
            pickupBuffer.push({ seatId: p.ownerId!, loot });
            if (world.onPickup) world.onPickup(p.ownerId!, loot);
            removeLoot.push(a.id);
            break;
          }
        }
      }
      if (removeLoot.length > 0) actors = actors.filter((a) => !removeLoot.includes(a.id));

      // (7) BOSS 阶段推进：hp 跨阈值 → phase 2（提升攻击频率）。
      for (const e of actors) {
        if (
          e.kind === EntityKind.BOSS &&
          (e.bossPhase ?? 0) < 1 &&
          e.hp < e.maxHp * BOSS_PHASE_THRESHOLD
        ) {
          e.bossPhase = 1;
        }
      }

      world.tick += 1;
    },

    snapshot(): WorldSnapshot {
      const entities: EntityState[] = actors.map((a) => {
        // 条件序列化（C12）：仅真实持有才附加对应字段，否则保持 undefined。
        const base: EntityState = {
          id: a.id,
          kind: a.kind as EntityState["kind"],
          pos: { x: Math.round(a.x), y: Math.round(a.y) },
          dir: a.dir,
          hp: a.hp,
          maxHp: a.maxHp,
          status: a.status,
          statusEffects: [],
          ...(a.loot
            ? {
                loot: {
                  itemId: a.loot.itemId,
                  rarity: a.loot.rarity,
                  affixes: a.loot.affixes,
                  ttlTicks: a.loot.ttlTicks,
                },
              }
            : {}),
          ...(a.entrance
            ? {
                entrance: {
                  cooldownTicks: a.entrance.cooldownTicks,
                  lastUsedTick: a.entrance.lastUsedTick,
                },
              }
            : {}),
          // E15：telegraph（仅真实持有才下发；C12 条件序列化——未持有不污染确定性哈希）。
          ...(a.telegraph
            ? {
                telegraph: {
                  shape: a.telegraph.shape,
                  color: a.telegraph.color,
                  startTick: a.telegraph.startTick,
                  applyTick: a.telegraph.applyTick,
                  radius: a.telegraph.radius,
                },
              }
            : {}),
          // 玩家：回填 ownerId（seatId 映射）+ 条件字段 parryState / skillCd / attrs（E7）。
          ...(a.ownerId !== undefined ? { ownerId: a.ownerId } : {}),
          ...(a.ownerId !== undefined && a.parryState
            ? { parryState: { active: a.parryState.active, windowEndTick: a.parryState.windowEndTick } }
            : {}),
          ...(a.ownerId !== undefined && a.skillCd
            ? { skillCd: a.skillCd.slice() }
            : {}),
          ...(a.ownerId !== undefined
            ? { attrs: playerAttrs(a.equipStats ?? EMPTY_EQUIP_STATS, a.levelStats, a.level, a.maxHp) }
            : {}),
          // 敌人/BOSS：tier（仅持有才下发）。
          ...(a.tier !== undefined ? { tier: a.tier } : {}),
        };
        return base;
      });
      return {
        tick: world.tick,
        roomId: world.roomId,
        phase: world.phase,
        entities,
      };
    },

    consumePickups(): PickupEvent[] {
      const out = pickupBuffer.slice();
      pickupBuffer.length = 0;
      return out;
    },

    consumeLevelUps(): LevelUpEvent[] {
      const out = levelUpBuffer.slice();
      levelUpBuffer.length = 0;
      return out;
    },

    spawnGroundLoot(seatId: number, loot: LootState) {
      // 在指定 seat 玩家脚下生成地面掉落（背包满溢出回落，C-Per-3）。
      const p = actors.find((x) => x.ownerId === seatId);
      // E15：无玩家时的安全落点 = 本 world respawnPos（主世界 RESPAWN_POS / 副本 entryTile）。
      const pos = p ? { x: p.x, y: p.y } : { x: respawnPos.x, y: respawnPos.y };
      actors.push({
        id: nextId++,
        kind: EntityKind.LOOT_GROUND,
        x: pos.x,
        y: pos.y,
        dir: 0,
        hp: 1,
        maxHp: 1,
        status: EntityStatus.ALIVE,
        loot: {
          itemId: loot.itemId,
          rarity: loot.rarity,
          affixes: loot.affixes.slice(),
          ttlTicks: loot.ttlTicks,
        },
      });
    },
  };

  return world;
}
