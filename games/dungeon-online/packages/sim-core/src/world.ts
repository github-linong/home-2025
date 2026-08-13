/**
 * world.ts — 权威世界（E1.S1.3 run-runtime 驱动对象；E3 布局落地；E4 每玩家输入路由）
 *
 * 本模块是 ① 编排层对权威状态的持有者：消费 E3 generateLayout 产出的 SpawnPoint[]
 *   （纪律 A：只读布局实例，不反向依赖 ⑤/⑧ 运行时），生成实体并在每个 tick 推进。
 *
 * E4（S4.1–S4.3）：输入改为「按玩家路由的每玩家输入队列」（PerPlayerInputQueue，同仓 input.ts）。
 *   world.step 先 drainForTick 收集各玩家最新有效输入 → 再推进模拟（移动/占位碰撞/边界），
 *   移除 E1 的「last input」全局占位逻辑。快照附带 lastProcessedSeq（S4.3 对账钩子）。
 *
 * Sprint 1 范围（占位移动/AI）：实体做「确定性占位移动」以验证 30Hz 循环真在 tick + 广播；
 *   真实 AI/碰撞/战斗在 E5/E6 接入，本文件不动纪律边界。
 */

import {
  EntityKind,
  EntityStatus,
  RoomPhase,
  WAVE_INTERMISSION_TICKS,
  CLASS_BASE,
  ENEMY_PROTOTYPES,
  InputAction,
  SKILL_IDS,
  TelegraphShape,
  DANGER_COLOR,
  PICKUP_RADIUS,
  LOOT_DROP_CHANCE,
  LOOT_MEDKIT_HEAL,
  LOOT_BUFF_MULT,
  LOOT_BUFF_PERCENT,
  LOOT_BUFF_TICKS,
  MAX_LOOT_ENTITIES,
  type EntityState,
  type WorldSnapshot,
  type InputCmd,
  type PlayerClass,
  type RoomPhaseValue,
  type EntityKindValue,
  type PersonalState,
  type Vec2,
} from "./types.ts";
import {
  RESCUE_TICKS,
  SOLO_SELF_RESCUE_TICKS,
  DOWNED_TIMEOUT_TICKS,
  withinRescueRadius,
  revivalHp,
  rescueCandidates,
  isOutEligibleTarget,
  capturePersonalState,
} from "./rescue.ts";
import { generateLayout, type LayoutSnapshot } from "./dungeon-gen.ts";
import { Rng, hashString64 } from "./rng.ts";
import { PerPlayerInputQueue, drainForTick } from "./input.ts";
import {
  resolveDamage,
  MIN_TELEGRAPH_TICKS,
  PLAYER_ATTACK_RANGE,
  PLAYER_ATTACK_CONE_RAD,
  KNOCKBACK_TICKS,
  BOSS_NOVA_INTERVAL,
  BOSS_NOVA_RADIUS,
  BOSS_NOVA_TELEGRAPH,
  CombatKind,
  type AttackWindup,
  type CombatEntity,
  type CombatState,
} from "./combat.ts";
import {
  stepEnemyAi,
  type EnemyAiSelf,
  type EnemyAiPlayer,
} from "./enemy-ai.ts";
import { resolveSkillApplication } from "./skills.ts";

export interface PlayerSeat {
  readonly seatId: number;
  readonly userId: string;
  readonly classId: PlayerClass;
}

export interface CreateWorldOpts {
  readonly runId: string;
  readonly seed: string;
  readonly biomeId: number;
  readonly players: readonly PlayerSeat[];
  /** 是否生成敌人（默认 true）。单元测试可在无敌人世界隔离 ⑪ 倒地/救援/超时逻辑。 */
  readonly spawnEnemies?: boolean;
  /** META-PROGRESSION（P2 2026-08-12）：开局预置的永久升级 perk 列表（如 ['dmg_up','dmg_up']）。
   *  由客户端 localStorage 的「灰烬升级」累计而来——「死了也变强」回环。确定性：列表来自
   *  localStorage（非随机）；单元测试/golden 不传 → 默认空 → 行为与原来完全一致，golden 无损。 */
  readonly startingPerks?: readonly string[];
}

interface Actor {
  id: number;
  kind: EntityKindValue;
  x: number;
  y: number;
  dir: number;
  hp: number;
  maxHp: number;
  status: number;
  ownerId?: number;
  enemyTypeId?: string;
  classId?: PlayerClass; // 玩家职业（驱动移动速率 / 未来伤害派生）
  telegraph?: AttackWindup | null; // 进行中的攻击前摇（D12）
  iframeUntilTick?: number; // dodge 免伤窗口截止 tick（DODGE）
  // ── G1 升级系统（击杀得经验 → 升级提升属性；仅玩家持有，确定性）──
  level?: number; // 当前等级（初值 1）
  xp?: number; // 当前经验（击杀敌人累积；达阈值升级）
  // ── G2 Buff 持续收益（玩家拾取 LOOT buff 的窗口；快照公开供 HUD 显示剩余秒）──
  buffUntilTick?: number;
  buffMult?: number;
  // ── E8 协作技运行时状态（仅 world.step 维护；纪律 B：落地只经 world.step / combat）──
  cooldownUntilTick?: number; // 协作技冷却截止 tick；<= 当前 tick 即可再次施法
  activeSkill?: number | null; // 当前/最近施放的协作技 id（HUD 用；即时技施放后保留至下次）
  shieldUntilTick?: number; // ⑨ SHIELD_ALLY 减伤护盾窗口截止 tick（combat 消费）
  shieldReduction?: number; // ⑨ SHIELD_ALLY 减伤比例 0..1
  tauntUntilTick?: number; // ⑨ TAUNT 施法者吸引敌火窗口截止 tick（敌人 AI 消费）
  // ── C4b 猎手标记易伤窗口（仅 world.step 维护；纪律 B：落地只经 world.step / combat）──
  markedUntilTick?: number; // 敌人被 MARK 后易伤窗口截止 tick（combat.resolveDamage 消费 ×1.25）
  // ── E7 倒地/救援/超时/托管状态（仅 world.step 维护；纪律 B）──
  rescueTicks: number; // 倒地后累积的救援读条 tick（S7.2）
  downedTicks: number; // 倒地后经过的 tick（S7.5 超时判定）
  disconnected: boolean; // 断线托管标记（S7.6）：跳过 tick + 暂停计时
  /** 断线瞬间抓拍的冻结态（D8 / P4 保底），单次持有，重连前不被覆盖。 */
  personalState?: PersonalState | null;
  // ── 掉落（progression/feedback；仅 loot 实体持有）──
  lootType?: number; // 0=medkit | 1=ammo | 2=buff
  value?: number; // 掉落数值（medkit 治疗量 / buff 百分比；ammo=0）
  // ── 拾取 buff（server-side 消费，不入快照；resolveDamage 单点落地）──
  buffUntilTick?: number; // 临时攻击 buff 窗口截止 tick
  buffMult?: number; // 临时攻击 buff 倍率（resolveDamage 消费，1+LOOT_BUFF_MULT）
  // ── Boss 多阶段（engagement；阶段只升不降，守卫一次性生怪）──
  phase?: number; // 1=常态 2=<50%hp 3=<25%hp；达到后保持
  // ── BOSS-MULTI-SKILL（P2 2026-08-12）：火焰新星周期（tick 单位）——
  //    boss 每 BOSS_NOVA_INTERVAL tick 以自身为中心爆 AOE_FILL 火圈（radius 130, telegraph 预警）。
  //    与普攻（CONE 扇形）交替 = 「靠近喷扇形 + 周期爆火圈」双技能节奏（参考 Hades boss 模式化）。
  //    确定性：初始由 world 在 boss spawn 后按 hash 派生，之后 +INTERVAL 纯算术。undefined → JSON 丢弃。
  bossNovaAtTick?: number;
  // 玩家硬直/击退（P0-1）之外：boss 新星预警已结算标记（防同一 tick 重复爆，纯内部守卫，不序列化）
  novaFiredTick?: number;
  // ── brute_charger 狂暴（enrage；血量破 50% 一次性生 1 只 grunt add，guard 防重复）──
  enraged?: boolean; // 触发狂暴后置 true（undefined → JSON 丢弃，不影响确定性快照哈希，与 phase 同先例）
  // ── AFFIX（P1 精英词缀 2026-08-12）：elite spawn 时确定性随机挂 1 个词缀（参考暗黑词缀）——
  //    "hasted" 移速 ×1.4 / "lifesteal" 攻击吸血 2（world 敌人 AI / 结算消费）。
  //    undefined → JSON 丢弃（不影响 golden 哈希；仅 elite 挂词缀，grunt/boss 无）。
  affix?: "hasted" | "lifesteal";
  // ── KNOCKBACK（P0-1 2026-08-12）：玩家近战命中敌人施加「击退位移 + 硬直」——
  //    割草游戏"砍飞一片"的核心反馈（参考暗黑/VS）。world.step 玩家 AOE 结算时设置，
  //    敌人移动阶段消费：击退窗口内沿 kbDir 位移，AI 暂停（不新起攻击）。
  //    确定性：方向/距离由命中时攻击者→目标几何决定，无随机源；会影响后续位置 → golden 重锁。
  kbUntilTick?: number; // 击退截止 tick（<= tick 即无效）
  kbDirX?: number;      // 击退方向单位向量 x
  kbDirY?: number;      // 击退方向单位向量 y
  // ── S2 局内 Build（perk；三选一后的服务端权威加成；仅玩家持有，undefined 不序列化）──
  perks?: string[];          // 已选 perk id 列表（HUD 展示）
  perkDamageMult?: number;   // 伤害倍率（combat.resolveDamage 消费）
  perkSpeedMult?: number;    // 移速倍率（world 移动消费）
  perkMaxHpBonus?: number;   // 生命上限绝对加成（选择时立即生效并同步 hp）
  perkCdr?: number;          // 技能冷却缩减 0..1（skills.cooldownTicks 缩放）
  // BUILD-UP（P1）：新能力型 perk 的服务端权威加成（undefined 不序列化，golden 无损）。
  perkAtkspd?: number;       // 普攻前摇缩放（<1 更快；如 0.75 = -25%；world 攻击前摇消费）
  perkRangeMult?: number;    // 攻击范围倍率（>1 更远；如 1.25 = +25%；world 射程校验 + AOE 结算消费）
}

/**
 * 飞行弹道实体（M16，瞬态；仅 world.step 内步进+碰撞，不入快照 entities）。
 * 确定性：固定速度（vx/vy px/tick）步进；born/expire 由 spawn tick + 固定寿命推算。
 */
export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number; // px/tick（确定性固定速度）
  vy: number;
  ownerId: number; // 发射者敌 id
  damage: number; // 命中伤害（扁平，取原型 attackDamage）
  bornTick: number;
  expireTick: number; // <= world.tick 或 ==-1（命中标记移除）则本 tick 清理
  radius: number; // 碰撞半径 px
}

export interface World {
  readonly runId: string;
  readonly seed: string;
  readonly biomeId: number;
  tick: number;
  roomPhase: RoomPhaseValue;
  /** 入队一条玩家输入（经网关路由，带 playerId）。C11 在此强制 seq 单调。 */
  enqueueInput(playerId: number, cmd: InputCmd): boolean;
  /** 推进一个权威 tick：先 drain 每玩家输入，再模拟。 */
  step(): void;
  /** 取当前权威快照（含 lastProcessedSeq 对账钩子）。 */
  snapshot(): WorldSnapshot;
  /** 只读 actor 视图（测试/调试用）。 */
  actors(): readonly Actor[];
  /** M16 只读飞行弹道视图（测试/调试用；瞬态实体，不入 entities）。 */
  projectiles(): readonly Projectile[];
  /** S7.6/S7.7 断线托管：置位/清除玩家 disconnected 标记，并在断开瞬间抓拍 PersonalState（D8 单次持有）。 */
  setDisconnected(playerId: number, disconnected: boolean): void;
  /**
   * S2 局内 Build：玩家在层间「商」点选择三选一 perk（服务端权威落地）。
   * 校验 perkId ∈ 当前可选池（perkChoices）；选择后立即生效（伤害/移速/生命/冷却）。
   * @returns 成功返回 true；perkId 非法/不可选返回 false（protocol 层据此回 error）。
   */
  applyPerk(playerId: number, perkId: string): boolean;
  /** S2 逃生口：本玩家跳过本层商点（视为已决策，perk 池按在场玩家全决策自动关闭）。 */
  skipPerk(playerId: number): boolean;
  /** S2 只读当前三选一可选池（客户端 HUD/协议下发用）。 */
  perkChoices(): readonly string[];
  /** S2 只读当前楼层（客户端 HUD 用；顶层字段，不影响 golden entities 哈希）。 */
  floor(): number;
  /** S2 总楼层数。 */
  totalFloors(): number;
}

/** S2 perk 目录（局内 Build 三选一）。所有倍率/加成服务端权威，客户端只展示名称。
 *  BUILD-UP（P0-2）：升级选择复用本池。P1 扩充「新能力型」perk（攻速/范围/吸血），
 *  参考 VS/Hades——不只纯数值倍率，还有改变攻击行为的能力。 */
export const PERK_CATALOG: Record<
  string,
  { name: string; desc: string; icon: string }
> = {
  dmg_up: { name: "伤害强化", desc: "所有攻击伤害 +15%", icon: "⚔" },
  hp_up: { name: "生命强化", desc: "生命上限 +20", icon: "❤" },
  spd_up: { name: "身法强化", desc: "移动速度 +12%", icon: "💨" },
  cdr_up: { name: "冷却加速", desc: "技能冷却时间 -15%", icon: "⏱" },
  atkspd_up: { name: "攻速强化", desc: "普攻前摇 -25%（挥砍更快）", icon: "🗡" },
  range_up: { name: "范围强化", desc: "攻击范围 +25%（砍得更远）", icon: "🛡" },
  lifesteal_up: { name: "汲取", desc: "击杀敌人回复 3 生命", icon: "🩸" },
};
/** 每个「商」点可选池大小（三选一）。 */
const PERK_CHOICES_PER_FLOOR = 3;
/** 可选池 = 目录随机抽 3（确定性 Rng，seed 由 run seed + floor 派生）。 */
const PERK_POOL: readonly string[] = Object.keys(PERK_CATALOG);

/**
 * 每 tick 移动速率 = CLASS_BASE[classId].moveSpeed / TICK_RATE（O2 接管：移除占位 MOVE_SPEED_PX）。
 * moveSpeed 单位 px/s，tick 率 30Hz → 归一化到每 tick 位移（可为小数，确定性可复现）。
 */
function moveSpeedPerTick(classId: PlayerClass): number {
  return CLASS_BASE[classId].moveSpeed / 30;
}

/**
 * 8 向 → 单位向量（世界坐标 x右/y下）。0=E(→+x)，顺时针（屏幕 y 下）：
 * 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE。供 `snapshot` 将攻击者 `Actor.dir`(0-7) 换算为
 * telegraph.dir 单位向量（N2）。Math.SQRT1_2 给出精确的 √2/2 归一化分量，确定性可复现。
 */
const DIR_UNIT_VECTORS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

/** 攻击者朝向 0-7 → 归一化单位向量（N2）；越界值取模保护。 */
function dirToVector(dir: number): Vec2 {
  const k = ((Math.trunc(dir) % 8) + 8) % 8;
  return DIR_UNIT_VECTORS[k];
}

/**
 * 单位向量 → 朝向 0-7（N2）：与 DIR_UNIT_VECTORS 反向映射。
 * 约定 0=E(→+x) 顺时针（屏幕 y 下）：1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE。
 * 用 Math.atan2(y,x)/(π/4) 四舍五入后 & 7；JS 位运算对负数正确回绕（如 -1&7=7、-2&7=6）。
 * 零向量（静止）直接返回 0；调用方仅在实体非静止移动时调用本函数（保持静止朝向）。
 */
function vecToDir8(v: Vec2): number {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return 0; // 静止保护
  const k = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) & 7;
  return k;
}

export function createWorld(opts: CreateWorldOpts): World {
  const layout: LayoutSnapshot = generateLayout(opts.seed, opts.biomeId);
  const actors: Actor[] = [];
  let nextId = 0;

  // ── M16 飞行弹道瞬态实体（确定性；每次 createWorld 独立重置）──
  // projectiles：本 run 活跃弹道列表；projSeq：弹道自增 id（闭包局部，与 nextId 同序确定）。
  let projectiles: Projectile[] = [];
  let projSeq = 1;

  // 是否生成敌人（默认 true）。false 时完全跳过波次推进（progression）与清场清理，
  // 用于隔离 ⑪ 倒地/救援/超时 与 ⑧ 协作技的单元测试（避免敌人碰撞噪声污染判定）。
  const spawnEnemiesEnabled = opts.spawnEnemies !== false;

  // ── 波次推进（progression）闭包状态（确定性；所有随机经现有 Rng(seed) 派生）──
  let currentWave = 1;
  let maxWave = Math.max(1, ...layout.spawnPoints.map((s) => s.wave));
  let intermissionUntilTick = 0;
  let currentRoomPhase: RoomPhaseValue = RoomPhase.ACTIVE;
  // ── S2 逐层下行 + 局内 Build（确定性；floor 由 layout.floorOfWave 映射，perk 池由 Rng 派生）──
  let currentFloor = layout.floorOfWave[1] ?? 1;
  let perkChoicesState: string[] = [];
  // 层间「商」点：进入新楼层（>1）前的过渡期生成三选一池；perkChoices 非空即客户端弹出信号。
  let lastPerkFloor = 0;  // 已发过商点的楼层（防同层重复弹）
  // ── ROUTE-PICK（P3）：层间路线选择（Hades 房间节点简化版）──
  // intermission 结束时生成「下一层路线」2 选 1（确定性 Rng 派生）；玩家 CHOOSE_FLOOR 选择后
  // 应用 modifier 再 spawnWave。未选择前 world 停留在 intermission（等待决策，不刷怪）。
  //   routeId: "deep"(深渊: 怪更肉但经验+50%) / "vault"(宝库: 怪更少但掉落率×2)
  let pendingFloorRoute: null | { options: Array<{ id: string; name: string; desc: string; icon: string }> } = null;
  let activeFloorRoute: null | string = null; // 当前层生效的路线 modifier
  // 层间生成路线选择（仅非首层；已生成本层防重复）。
  let lastRouteFloor = 0;
  function openFloorRoute(nextFloor: number): void {
    if (nextFloor <= 1 || lastRouteFloor === nextFloor) return;
    lastRouteFloor = nextFloor;
    const rr = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:route:${nextFloor}`));
    // 2 选 1（确定性；重跑同 seed 一致）。
    const options = [
      { id: "deep",  name: "深渊", desc: "敌人更肉(+20% HP) 但经验 +50%", icon: "🌋" },
      { id: "vault", name: "宝库", desc: "敌人更少(-25%) 但掉落率 ×2", icon: "💎" },
    ];
    pendingFloorRoute = { options };
  }
  const pickedPerkThisOffer = new Set<number>(); // 已在本层商点选过的 playerId（防重复选择）
  // waveHasBoss[n] = wave n 是否含 boss（用于 BOSS 阶段路由）；仅索引 1..maxWave 有效。
  const waveHasBoss: boolean[] = [];
  for (let n = 1; n <= maxWave; n += 1) {
    waveHasBoss[n] = layout.spawnPoints.some(
      (sp) => sp.wave === n && ENEMY_PROTOTYPES[sp.enemyTypeId].tier === "boss",
    );
  }

  // ── 掉落 / Boss 生怪 确定性工厂（闭合 createWorld 闭包，访问 actors/nextId）──
  /** 敌人死亡 → 确定性生成掉落（seed 由 敌 id + tick；无 Math.random/Date）。上限保护防 runaway。 */
  function trySpawnLoot(dead: Actor, tick: number): void {
    const lootCount = () =>
      actors.reduce((n, a) => n + (a.kind === EntityKind.LOOT ? 1 : 0), 0);
    if (lootCount() >= MAX_LOOT_ENTITIES) return;
    let drops: Array<{ lootType: number; value: number }> = [];
    if (dead.enemyTypeId === "boss_emberlord") {
      // boss 必掉：1 medkit + 1 buff（确定性，不掷骰）。
      drops.push({ lootType: 0, value: LOOT_MEDKIT_HEAL });
      drops.push({ lootType: 2, value: LOOT_BUFF_PERCENT });
    } else {
      // grunt/elite：drop chance ~0.5（seed 由 敌 id + tick，确定）。
      const rng = new Rng(hashString64(`${dead.id}:${tick}:loot`));
      if (!rng.nextBool(LOOT_DROP_CHANCE)) return;
      const r = rng.nextFloat();
      if (r < 0.5) drops.push({ lootType: 0, value: LOOT_MEDKIT_HEAL });
      else if (r < 0.8) drops.push({ lootType: 1, value: 0 });
      else drops.push({ lootType: 2, value: LOOT_BUFF_PERCENT });
    }
    for (const d of drops) {
      if (lootCount() >= MAX_LOOT_ENTITIES) break;
      const rng = new Rng(hashString64(`${dead.id}:${tick}:loot:${d.lootType}`));
      actors.push({
        id: nextId++,
        kind: EntityKind.LOOT,
        x: dead.x + rng.nextInt(-8, 8),
        y: dead.y + rng.nextInt(-8, 8),
        dir: 0,
        hp: 0,
        maxHp: 0,
        status: 0,
        lootType: d.lootType,
        value: d.value,
        rescueTicks: 0,
        downedTicks: 0,
        disconnected: false,
        personalState: null,
      });
    }
  }

  /** Boss 阶段 3 一次性生 2 只 grunt_swarm 近怪（seed 由 boss id + tick，确定）。 */
  function spawnBossAdds(boss: Actor, tick: number): void {
    const proto = ENEMY_PROTOTYPES.grunt_swarm;
    const rng = new Rng(hashString64(`${boss.id}:${tick}:adds`));
    for (let i = 0; i < 2; i++) {
      const ox = rng.nextInt(-48, 48);
      const oy = rng.nextInt(-48, 48);
      const hp = rng.nextInt(proto.hpMin, proto.hpMax);
      actors.push({
        id: nextId++,
        kind: EntityKind.ENEMY,
        x: boss.x + ox,
        y: boss.y + oy,
        dir: rng.nextInt(0, 7),
        hp,
        maxHp: hp,
        status: EntityStatus.ALIVE,
        enemyTypeId: "grunt_swarm",
        enraged: undefined,
        rescueTicks: 0,
        downedTicks: 0,
        disconnected: false,
        personalState: null,
      });
    }
  }

  /** G1 升级：玩家获得经验；达阈值连续升级。升级提升：maxHp+10（同步回 20% 血）、普攻伤害 +3、
   *  移速 +2%（由 combat/world 消费——普攻伤害在 resolveDamage 按 level 派生，移速在移动消费）。
   *  BUILD-UP（P0-2 2026-08-12）：升级时额外触发一次「能力三选一」（复用 S2 perk 机制，
   *  参考 VS/Hades「每级选能力」）。升级 = 自动成长 + 一次构筑选择 —— 核心乐趣从"自动变强"
   *  变成"选择怎么变强"。确定性：选择池由 run seed + playerId + level 派生（无随机源）。
   *  确定性：纯算术 + 循环，无随机源。 */
  function grantXp(pl: Actor, amount: number): void {
    if (pl.kind !== EntityKind.PLAYER) return;
    pl.xp = (pl.xp ?? 0) + amount;
    let lv = pl.level ?? 1;
    let leveled = false;
    // 升级循环：xpToNext(lv) = 30 + (lv-1)*25。
    while ((pl.xp ?? 0) >= 30 + (lv - 1) * 25) {
      pl.xp = (pl.xp ?? 0) - (30 + (lv - 1) * 25);
      lv += 1;
      pl.level = lv;
      pl.maxHp += 10;
      pl.hp = Math.min(pl.maxHp, pl.hp + Math.ceil(pl.maxHp * 0.2)); // 升级补 20% 血
      pl.levelUpCount = (pl.levelUpCount ?? 0) + 1; // 供客户端播放升级特效
      leveled = true;
    }
    // BUILD-UP：本次升级（且当前无未决策的弹窗）→ 生成一次「能力三选一」。
    // 只在新升级那一级开一次（防连升多次重复弹）；若已有弹窗（层间商点/上次升级未选）则不覆盖。
    if (leveled && perkChoicesState.length === 0) {
      const upRng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:lvlup:${pl.id}:${lv}`));
      const pool = [...PERK_POOL];
      perkChoicesState = [];
      for (let i = 0; i < PERK_CHOICES_PER_FLOOR && pool.length > 0; i += 1) {
        const idx = upRng.nextInt(0, pool.length - 1);
        perkChoicesState.push(pool[idx]);
        pool.splice(idx, 1);
      }
      pickedPerkThisOffer.clear();
    }
  }

  /** brute_charger 狂暴：血量破 50% 时确定性一次性生 1 只 grunt_swarm 近怪（seed 由 charger id + tick）。 */
  function spawnChargerAdd(charger: Actor, tick: number): void {
    const proto = ENEMY_PROTOTYPES.grunt_swarm;
    const rng = new Rng(hashString64(`${charger.id}:${tick}:chargerAdd`));
    const ox = rng.nextInt(-40, 40);
    const oy = rng.nextInt(-40, 40);
    const hp = rng.nextInt(proto.hpMin, proto.hpMax);
    actors.push({
      id: nextId++,
      kind: EntityKind.ENEMY,
      x: charger.x + ox,
      y: charger.y + oy,
      dir: rng.nextInt(0, 7),
      hp,
      maxHp: hp,
      status: EntityStatus.ALIVE,
      enemyTypeId: "grunt_swarm",
      enraged: undefined,
      rescueTicks: 0,
      downedTicks: 0,
      disconnected: false,
      personalState: null,
    });
  }

  /** 波次推进（progression）：生成本 wave n 的敌人/Boss（确定性 Rng，seed 含 wave 号）。
   * 复用现有 Rng(hashString64(...))，不引入 Date/Math.random；字段集与既有敌人 spawn 完全一致
   * （含 rescueTicks/downedTicks/disconnected/personalState:null），保证其它系统不受影响。 */
  function spawnWave(n: number): void {
    const wrng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:wave:${n}:enemies`));
    // TIME-PRESSURE（P1 2026-08-12）：敌人 HP 随所在楼层缩放（参考雨中冒险2 时间压力）。
    //   wave n 所在楼层 = layout.floorOfWave[n]（S2 映射）；每层 +15% HP，让「越下越强」有体感。
    //   确定性：floorOfWave 是固定序列，纯算术，无随机源 → golden 需重锁。
    const waveFloor = layout.floorOfWave[n] ?? 1;
    let floorScale = 1 + 0.15 * (waveFloor - 1);
    // ROUTE-PICK（P3）：当前层生效的路线 modifier 影响生成。
    //   deep → 敌人 HP ×1.2（更肉）；vault → 生成数量 ×0.75（更少怪）。
    //   确定性：activeFloorRoute 由玩家 CHOOSE_FLOOR 决定（有限集合，无随机源）。
    let routeCountScale = 1;
    if (activeFloorRoute === "deep") floorScale *= 1.2;
    else if (activeFloorRoute === "vault") routeCountScale = 0.75;
    for (const sp of layout.spawnPoints) {
      if (sp.wave !== n) continue;
      const proto = ENEMY_PROTOTYPES[sp.enemyTypeId];
      const spCount = Math.max(1, Math.round(sp.count * routeCountScale));
      for (let i = 0; i < spCount; i += 1) {
        const hp = Math.max(1, Math.round(wrng.nextInt(proto.hpMin, proto.hpMax) * floorScale));
        const kind = proto.tier === "boss" ? EntityKind.BOSS : EntityKind.ENEMY;
        // AFFIX（P1 精英词缀）：elite spawn 时确定性派生 1 个词缀（wrng 已由 wave seed 派生，无随机源）。
        //   elite 才有词缀；grunt/boss 无（undefined → JSON 丢弃，golden 无损）。
        let affix: "hasted" | "lifesteal" | undefined;
        if (proto.tier === "elite") {
          affix = wrng.nextInt(0, 1) === 0 ? "hasted" : "lifesteal";
        }
        actors.push({
          id: nextId++,
          kind,
          x: sp.pos.x + wrng.nextInt(-32, 32),
          y: sp.pos.y + wrng.nextInt(-32, 32),
          dir: wrng.nextInt(0, 7),
          hp,
          maxHp: hp,
          status: EntityStatus.ALIVE,
          enemyTypeId: sp.enemyTypeId,
          affix,
          enraged: undefined,
          rescueTicks: 0,
          downedTicks: 0,
          disconnected: false,
          personalState: null,
          // BOSS-MULTI-SKILL（P2）：boss 首颗新星由 wave seed 确定性派生（错峰 1.5-3s），
          //   之后每 +BOSS_NOVA_INTERVAL tick 一次（phase 段纯算术推进，无随机源）。
          bossNovaAtTick: kind === EntityKind.BOSS ? wrng.nextInt(45, 90) : undefined,
        });
      }
    }
    currentWave = n;
    currentRoomPhase = waveHasBoss[n] ? RoomPhase.BOSS : RoomPhase.ACTIVE;
  }

  /** M16 飞行弹道步进（确定性；固定速度位移 + 碰撞 + 过期/越界清理）。
   * 碰撞经 ⑦ resolveDamage（唯一 hp 出口，自动尊重 IFRAME/DODGE 免伤）；绝不直改 pl.hp（纪律 B）。
   * bounds 包含整张地牢（64*32 x 40*32 = 2048 x 1280）+ 256 余量，仅影响弹道寿命，不影响确定性。 */
  function stepProjectiles(state: CombatState): void {
    // (1) 步进：固定速度位移。
    for (const p of projectiles) {
      p.x += p.vx;
      p.y += p.vy;
    }
    // (2) 碰撞：仅对 ALIVE 且非 DOWNED/OUT 的 PLAYER 结算（PLAYER kind，非 DOWNED/OUT）。
    const pr = 14; // PLAYER 碰撞半径（与移动判定一致）
    for (const p of projectiles) {
      if (p.expireTick === -1) continue; // 已命中标记移除，跳过
      for (const pl of actors) {
        if (pl.kind !== EntityKind.PLAYER) continue;
        if (!isOutEligibleTarget(pl.status)) continue; // 已倒地/出局不结算
        if (Math.hypot(p.x - pl.x, p.y - pl.y) <= p.radius + pr) {
          // 纪律 B：伤害经唯一出口 combat.resolveDamage（自动尊重 IFRAME/DODGE 免伤）。
          resolveDamage(state, {
            sourceId: p.ownerId,
            targetId: pl.id,
            amount: 0,
            tick: world.tick,
            kind: CombatKind.PROJECTILE,
            enemyDamage: p.damage,
          });
          p.expireTick = -1; // 标记移除（本 tick 末尾过滤）
          break;
        }
      }
    }
    // (3) 过期/越界移除（bounds 含整张地牢 + 余量，仅影响弹道寿命，不影响确定性）。
    projectiles = projectiles.filter(
      (p) =>
        p.expireTick > world.tick &&
        p.expireTick !== -1 &&
        p.x > -256 && p.x < 2304 && p.y > -256 && p.y < 1536,
    );
  }

  // 玩家：按座位环绕分布在地图中心附近。
  const centerX = 32 * 32;
  const centerY = 20 * 32;
  for (const p of opts.players) {
    const base = CLASS_BASE[p.classId];
    const angle = (p.seatId / Math.max(1, opts.players.length)) * Math.PI * 2;
      actors.push({
        id: nextId++,
        kind: EntityKind.PLAYER,
        x: centerX + Math.round(Math.cos(angle) * 64),
        y: centerY + Math.round(Math.sin(angle) * 64),
        dir: 0,
        hp: base.hp,
        maxHp: base.hp,
        status: EntityStatus.ALIVE,
        ownerId: p.seatId,
        classId: p.classId,
        rescueTicks: 0,
        downedTicks: 0,
        disconnected: false,
        personalState: null,
        // ── G1 升级初始状态（击杀得经验 → 升级提升属性）──
        level: 1,
        xp: 0,
        // ── E8 协作技初始状态（仅玩家持有；敌人不施技，字段保持 undefined）──
        cooldownUntilTick: 0,
        activeSkill: null,
        shieldUntilTick: 0,
        shieldReduction: 0,
        tauntUntilTick: 0,
      });
      // META-PROGRESSION（P2）：开局预置永久升级 perk（灰烬购买，localStorage 累计）。
      //   复用 perk 字段（dmg_up/hp_up/spd_up/cdr_up...），叠加生效——「死了也变强」。
      //   确定性：列表来自 opts.startingPerks（客户端 localStorage，非随机）；golden 不传 → 空。
      if (opts.startingPerks && opts.startingPerks.length > 0) {
        const pl = actors[actors.length - 1]; // 刚 push 的玩家
        const plBase = CLASS_BASE[p.classId];
        for (const pid of opts.startingPerks) {
          if (pid === "dmg_up") pl.perkDamageMult = (pl.perkDamageMult ?? 1) * 1.15;
          else if (pid === "spd_up") pl.perkSpeedMult = (pl.perkSpeedMult ?? 1) * 1.12;
          else if (pid === "cdr_up") pl.perkCdr = (pl.perkCdr ?? 0) + 0.15;
          else if (pid === "atkspd_up") pl.perkAtkspd = (pl.perkAtkspd ?? 1) * 0.75;
          else if (pid === "range_up") pl.perkRangeMult = (pl.perkRangeMult ?? 1) * 1.25;
          else if (pid === "hp_up") {
            const bonus = (pl.perkMaxHpBonus ?? 0) + 20;
            pl.perkMaxHpBonus = bonus;
            pl.maxHp = plBase.hp + bonus;
            pl.hp = pl.maxHp; // 满血开局
          } else if (pid === "lifesteal_up") {
            // 吸血无叠加上限语义：记录（击杀回血固定 3，多选仍 3，等价单次）
          }
          pl.perks = pl.perks ? [...pl.perks, pid] : [pid];
        }
      }
  }

  // 敌人：波次推进（progression）—— 初始只生 wave 1；后续 wave 在 step 末尾清场后按间隔派生。
  // spawnEnemies===false 时跳过（单元测试隔离 ⑪ 机制，避免敌人碰撞噪声污染判定）；此时不调
  // spawnWave，world 无敌人，且 step 末尾的波次推进整体关闭。
  if (spawnEnemiesEnabled) {
    spawnWave(1);
  }

  const inputs = new PerPlayerInputQueue();
  for (const p of opts.players) inputs.register(p.seatId);

  const world: World = {
    runId: opts.runId,
    seed: opts.seed,
    biomeId: opts.biomeId,
    tick: 0,
    get roomPhase() {
      return currentRoomPhase;
    },
    actors: () => actors.slice(),
    projectiles: () => projectiles.slice(),
    enqueueInput(playerId: number, cmd: InputCmd) {
      return inputs.enqueue(playerId, cmd);
    },
    step() {
      // E4：先按玩家路由收集本 tick 最新有效输入（移除 E1 全局 last-input 占位）。
      const perPlayer = drainForTick(inputs);

      // 组装战斗态（⑦ resolveDamage 的实体视图；同一批可变对象，结算直接落回 actors）。
      const entityMap: Map<number, CombatEntity> = new Map();
      for (const a of actors) entityMap.set(a.id, a as CombatEntity);
      const combatState: CombatState = { tick: world.tick, entities: entityMap };

      for (const a of actors) {
        // O-M 修复：dodge 免伤窗口过期后清除 IFRAME 位。否则 status=ALIVE|IFRAME 永不清，
        // 叠加下方输入门控的严格相等 `status === EntityStatus.ALIVE` 会让玩家永久冻结。
        if (a.iframeUntilTick != null && a.iframeUntilTick <= world.tick) {
          a.status &= ~EntityStatus.IFRAME;
          a.iframeUntilTick = undefined;
        }
        // E8 协作技状态窗口过期清理（仅 world.step 维护；不影响序列化快照确定性）。
        if (a.shieldUntilTick != null && a.shieldUntilTick > 0 && a.shieldUntilTick <= world.tick) {
          a.shieldUntilTick = 0;
          a.shieldReduction = 0;
        }
        if (a.tauntUntilTick != null && a.tauntUntilTick > 0 && a.tauntUntilTick <= world.tick) {
          a.tauntUntilTick = 0;
        }
        if (a.cooldownUntilTick != null && a.cooldownUntilTick > 0 && a.cooldownUntilTick <= world.tick) {
          a.cooldownUntilTick = 0; // 冷却结束，复位以便再次施法
        }
        // O-M 修复：输入门控改为位运算 —— ALIVE 且非 DOWNED 即可行动（dodge 期间仍可移动/攻击，
        // dodge 纯防御）；DOWNED 玩家被正确排除。不再用严格相等，避免 IFRAME 位使 status(17)≠ALIVE(1)。
        // E7 扩展：OUT 玩家本 run 作旁观（不可行动）；disconnected 玩家跳过 tick（S7.6 托管）。
        if (
          (a.status & EntityStatus.ALIVE) !== 0 &&
          !(a.status & EntityStatus.DOWNED) &&
          !(a.status & EntityStatus.OUT) &&
          !a.disconnected &&
          a.kind === EntityKind.PLAYER
        ) {
          const cmd = perPlayer.get(a.ownerId as number);
          if (!cmd) continue;
          if (cmd.action === InputAction.MOVE) {
            // O2 移动接管：CLASS_BASE.moveSpeed / 30（每 tick 位移，可为小数）。
            // S2 perk：身法强化 → 移速 ×perkSpeedMult（>1）；未选则 ×1（golden 无损）。
            const ms = moveSpeedPerTick(a.classId!) * (a.perkSpeedMult ?? 1);
            a.x += cmd.dir.x * ms;
            a.y += cmd.dir.y * ms;
            // N2：仅当真正移动（位移非 0）才更新朝向，保持静止时的上次朝向（不重置）。
            if (cmd.dir.x !== 0 || cmd.dir.y !== 0) a.dir = vecToDir8(cmd.dir);
          } else if (cmd.action === InputAction.ATTACK) {
            // 战斗意图：启动前摇（D12）。若已有进行中前摇则忽略（防覆盖/刷新）。
            // DIST-FIX：玩家普攻有射程（PLAYER_ATTACK_RANGE≈60px）。目标超出射程 → 本次 ATTACK
            // no-op（不启动前摇），避免「隔全图锁头攻击」破坏走位/风筝玩法。
            if (!a.telegraph) {
              let targetOk = false;
              if (cmd.target != null) {
                const tgt = actors.find((t) => t.id === cmd.target);
                if (tgt && (tgt.status & EntityStatus.ALIVE) !== 0) {
                  const dx = tgt.x - a.x;
                  const dy = tgt.y - a.y;
                  // BUILD-UP（P1）：范围强化 perk → 射程 ×perkRangeMult。
                  const rangePx = PLAYER_ATTACK_RANGE * (a.perkRangeMult ?? 1);
                  targetOk = dx * dx + dy * dy <= rangePx * rangePx;
                }
              }
              if (!targetOk) {
                // 无有效射程内目标 → 忽略本次攻击（不回 a.id 自打）。
                a.telegraph = null;
              } else {
                // 玩家普攻：记录攻击朝向（cmd.dir = 客户端 aimDir / 移动方向）用于扇形 AOE 结算。
                // RANGE-BALANCE：玩家近战从单体改前向扇形，命中方向即本次挥砍朝向。
                // BUILD-UP（P1）：攻速强化 perk → 前摇 ticks ×perkAtkspd（<1 更快）。
                const d = cmd.dir && (cmd.dir.x !== 0 || cmd.dir.y !== 0) ? cmd.dir : { x: 1, y: 0 };
                const dl = Math.hypot(d.x, d.y) || 1;
                const windupTicks = Math.max(
                  1,
                  Math.round(MIN_TELEGRAPH_TICKS * (a.perkAtkspd ?? 1)),
                );
                a.telegraph = {
                  startTick: world.tick,
                  applyTick: world.tick + windupTicks,
                  targetId: cmd.target!,
                  kind: CombatKind.ATTACK,
                  dir: { x: d.x / dl, y: d.y / dl },
                };
              }
            }
          } else if (cmd.action === InputAction.SKILL) {
            // E8 / O-A 闭合：协作技路由。skills.ts 纯校验 + 效果数学产出 SkillApplication
            // 意图；本处（world.step）落地——所有 hp/status 改变只经 combat/world（纪律 B）。
            // 冷却门控：冷却未结束直接忽略（不进入冷却、不落地）。
            if ((a.cooldownUntilTick ?? 0) <= world.tick) {
              let target =
                cmd.target != null ? actors.find((t) => t.id === cmd.target) ?? null : null;
              const skillId = cmd.param ?? SKILL_IDS.SHIELD_ALLY;
              // SOLO-SELF-FALLBACK：无其他活跃玩家（单机割草）时，SHIELD_ALLY 允许对自身施放
              // 护盾 —— 参考吸血鬼幸存者：solo 技能必须"按了有反馈"，护盾自保而非指向空盟友。
              // 覆盖 target 为 null（cmd.target=0 无该 id）与 target==caster（玩家 id 恰为 0）
              // 两种情况：只要 solo 环境，护盾一律落地到自己。
              const hasOtherPlayer = actors.some(
                (t) =>
                  t.kind === EntityKind.PLAYER &&
                  t.id !== a.id &&
                  !(t.status & EntityStatus.OUT),
              );
              const allowSelfCast = !hasOtherPlayer && skillId === SKILL_IDS.SHIELD_ALLY;
              if (allowSelfCast) target = a;
              const app = resolveSkillApplication(
                { id: a.id, kind: a.kind, status: a.status, disconnected: a.disconnected, classId: a.classId, x: a.x, y: a.y },
                target
                  ? { id: target.id, kind: target.kind, status: target.status, disconnected: target.disconnected, classId: target.classId, x: target.x, y: target.y }
                  : null,
                skillId, world.tick, allowSelfCast,
              );
              if (app) {
                // ① SHIELD_ALLY：给目标盟友设减伤护盾窗口（combat.resolveDamage 消费）。
                if (app.shieldTicks > 0) {
                  const tgt = actors.find((t) => t.id === app.targetId);
                  if (tgt) {
                    tgt.shieldUntilTick = world.tick + app.shieldTicks;
                    tgt.shieldReduction = app.shieldReduction;
                  }
                }
                // ② REVIVE_BOOST：给倒地盟友救援读条直接加成（rescueTicks，非 hp/status）。
                if (app.rescueBoostTicks > 0) {
                  const tgt = actors.find((t) => t.id === app.targetId);
                  if (tgt) tgt.rescueTicks += app.rescueBoostTicks;
                }
                // ③ TAUNT：施法者吸引敌火（设 tauntUntilTick，敌人 AI 经 taunt 池优先锁定）。
                if (app.tauntTicks > 0) {
                  a.tauntUntilTick = world.tick + app.tauntTicks;
                }
                // ④ MARK（C4b 游侠专属进攻技）：给目标敌人施加易伤窗口（combat.resolveDamage 消费 ×1.25）。
                //   纯状态 set，无 hp 改变（discipline B：仅 world.step 改状态）。
                if (app.markTicks > 0) {
                  const tgt = actors.find((t) => t.id === app.targetId);
                  if (tgt) tgt.markedUntilTick = world.tick + app.markTicks;
                }
                // ⑤ BARRAGE（C4b 术士专属进攻技）：对目标敌人造成扁平伤害（SKILL 类，受 D12 前摇门控）。
                //   经 ⑦ resolveDamage（唯一 hp 结算出口）落地，discipline B；kind=SKILL 不 bypass windup
                //   （仅 PROJECTILE 绕过），故若施法者仍有未完成的攻击前摇则本弹幕结算为 no-op。
                if (app.flatDamage > 0) {
                  resolveDamage(combatState, {
                    sourceId: app.casterId,
                    targetId: app.targetId,
                    amount: 0,
                    tick: world.tick,
                    kind: CombatKind.SKILL,
                    enemyDamage: app.flatDamage,
                  });
                }
                // S2 perk：冷却加速 → 冷却时间 ×(1 - perkCdr)（如 -15%）。
                const cdr = a.perkCdr ?? 0;
                a.cooldownUntilTick = world.tick + Math.round(app.cooldownTicks * (1 - cdr));
                a.activeSkill = app.skillId;
              }
            }
          } else if (cmd.action === InputAction.DODGE) {
            // 闪避：立即经 ⑦ 授予来源自身 IFRAME 免伤窗口（无前摇）。
            resolveDamage(combatState, {
              sourceId: a.id,
              targetId: a.id,
              amount: 0,
              tick: world.tick,
              kind: CombatKind.DODGE,
            });
          } else if (cmd.action === InputAction.CHOOSE_FLOOR) {
            // ROUTE-PICK（P3）：层间路线选择（仅首位玩家生效；参数=选项 idx）。
            if (pendingFloorRoute && cmd.param != null && cmd.param >= 0 && cmd.param < pendingFloorRoute.options.length) {
              const opt = pendingFloorRoute.options[cmd.param];
              activeFloorRoute = opt.id;
              pendingFloorRoute = null;
              // 选择后立即生成下一层敌人（modifier 影响 spawnWave 的 HP/掉落）。
              spawnWave(currentWave + 1);
            }
          }
          // SIGNAL → 无模拟效果（E10 信号系统，本 Sprint 不实现）。
        } else if (a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS) {
          // E6 敌人 AI：stepEnemyAi 只产意图（纪律 B：绝不直改实体），world 翻译执行。
          const self: EnemyAiSelf = {
            id: a.id,
            x: a.x,
            y: a.y,
            enemyTypeId: a.enemyTypeId!,
          };
          const players: EnemyAiPlayer[] = actors
            .filter((t) => t.kind === EntityKind.PLAYER && isOutEligibleTarget(t.status))
            .map((t) => ({
              id: t.id,
              x: t.x,
              y: t.y,
              alive: true,
              // ⑨ E8 TAUNT：施法者处于嘲讽窗口 → 敌人 AI 优先锁定（吸引敌火）。
              taunt: t.tauntUntilTick != null && t.tauntUntilTick > 0 && t.tauntUntilTick > world.tick,
            }));
          const intent = stepEnemyAi(self, { tick: world.tick, players });

          // ── Boss 多阶段（engagement；确定性，seed 由 boss id+tick）──
          // 阶段随 hp 比例下降（1→2 @<50% →3 @<25%），只升不降（a.phase 守卫一次性生怪）。
          // 阶段 2+：移速 ×1.4、telegraphTicks ×0.8；阶段 3：移速 ×1.6 + 一次性生 2 只 grunt_swarm。
          let speedMult = 1;
          let telMult = 1;
          if (a.kind === EntityKind.BOSS) {
            const ratio = a.maxHp > 0 ? a.hp / a.maxHp : 0;
            const phase = ratio < 0.25 ? 3 : ratio < 0.5 ? 2 : 1;
            if (phase > (a.phase ?? 1)) {
              a.phase = phase; // 阶段只升不降
              if (phase === 3) spawnBossAdds(a, world.tick); // 一次性生怪（守卫防重复）
            }
            speedMult = phase >= 3 ? 1.6 : phase >= 2 ? 1.4 : 1.0;
            telMult = phase >= 2 ? 0.8 : 1.0;
            // BOSS-MULTI-SKILL（P2）：火焰新星周期 —— 参考 Hades boss 模式化技能。
            //   bossNovaAtTick 由 spawn 时确定性派生；到达时设 telegraph（novaRadius=130,
            //   applyTick=+25 预警），结算复用 bomber AOE 模式。若已有普攻前摇则不覆盖（防吞）。
            if (a.bossNovaAtTick != null && world.tick >= a.bossNovaAtTick && a.novaFiredTick !== world.tick) {
              a.novaFiredTick = world.tick;
              a.bossNovaAtTick = world.tick + BOSS_NOVA_INTERVAL; // 排下一次
              // 强制覆盖普攻前摇（新星是周期技能，优先级更高；普攻丢一次可接受）：
              //   若普攻 telegraph 正在前摇中，它会被本次新星替换——下一 tick AI 再开新普攻。
              a.telegraph = {
                startTick: world.tick,
                applyTick: world.tick + Math.max(1, Math.round(BOSS_NOVA_TELEGRAPH * telMult)),
                targetId: a.id, // 新星无特定目标（AOE），targetId 仅占位
                kind: CombatKind.ATTACK,
                novaRadius: BOSS_NOVA_RADIUS,
              };
            }
          }

          // KNOCKBACK（P0-1）：击退窗口内 → 沿 kbDir 位移（速度 130px/s），AI 暂停
          //   （不执行 MOVE/ATTACK）——"砍飞一片"期间敌人被压制，无法反击或走位。
          if (a.kbUntilTick != null && a.kbUntilTick > world.tick) {
            const kbSpeed = 130; // px/s 击退速度（≈ 1.5× grunt 移速，直观"被打飞"）
            const kbStep = kbSpeed / 30;
            a.x += (a.kbDirX ?? 0) * kbStep;
            a.y += (a.kbDirY ?? 0) * kbStep;
          } else if (intent.type === "MOVE") {
            // 敌人移速按 ENEMY_PROTOTYPES.speed / 30（每 tick 位移，平衡初稿）；Boss 阶段叠加倍率。
            // AFFIX（P1）：hasted 精英 → 移速 ×1.4（更危险，需优先处理）。
            const proto = ENEMY_PROTOTYPES[a.enemyTypeId!];
            const affixMult = a.affix === "hasted" ? 1.4 : 1;
            const ms = (proto.speed / 30) * speedMult * affixMult;
            a.x += intent.dir.x * ms;
            a.y += intent.dir.y * ms;
            // N2：敌人移动即更新朝向（静止时保持上次朝向）。
            if (intent.dir.x !== 0 || intent.dir.y !== 0) a.dir = vecToDir8(intent.dir);
          } else if (intent.type === "ATTACK") {
            // 攻击前摇：tier 分层 telegraphTicks（≥18，D12）；Boss 阶段 -20%；已有前摇则忽略。
            if (!a.telegraph) {
              const proto = ENEMY_PROTOTYPES[a.enemyTypeId!];
              a.telegraph = {
                startTick: world.tick,
                applyTick: world.tick + Math.round(proto.telegraphTicks * telMult),
                targetId: intent.targetId,
                kind: CombatKind.ATTACK,
              };
            }
          }
        }
      }

      // 前摇结算（D12）：applyTick <= 当前 tick 的攻击经 ⑦ 权威结算（C11 服务端伤害）。
      for (const a of actors) {
        if (a.telegraph && a.telegraph.applyTick <= world.tick) {
          const proto = a.enemyTypeId != null ? ENEMY_PROTOTYPES[a.enemyTypeId] : null;
          if (a.kind === EntityKind.BOSS && a.telegraph.novaRadius != null) {
            // BOSS-MULTI-SKILL（P2）：火焰新星 —— 以 boss 为中心半径 novaRadius 内所有 ALIVE 玩家
            //   结算 attackDamage（复用 bomber AOE 结算模式）。确定性：遍历 actors 数组顺序。
            const r2 = a.telegraph.novaRadius * a.telegraph.novaRadius;
            for (const t of actors) {
              if (t.kind !== EntityKind.PLAYER) continue;
              if ((t.status & EntityStatus.ALIVE) === 0) continue;
              const dx = t.x - a.x;
              const dy = t.y - a.y;
              if (dx * dx + dy * dy <= r2) {
                resolveDamage(combatState, {
                  sourceId: a.id,
                  targetId: t.id,
                  amount: 0,
                  tick: world.tick,
                  kind: a.telegraph.kind,
                  enemyDamage: proto?.attackDamage ?? 14,
                });
              }
            }
          } else if (a.enemyTypeId === "bomber_imp" && proto) {
            // 自爆兵 AOE（M13）：applyTick 抵达 → 对 bomber 半径（=attackRange）内所有 ALIVE 玩家，
            // 经 ⑦ resolveDamage 各结算 attackDamage（AOE，非仅原目标 telegraph.targetId）；随后自毁。
            // 纪律 B：AOE 伤害走 resolveDamage（唯一 hp 结算出口）；自毁（set hp=0 + DOWNED）发生在
            // 本 world.step 内（授权自改路径），由本 tick 末尾 dead-enemy 清理移除（M7）。自杀单位
            // 非被玩家击杀的目标，不在此触发 trySpawnLoot（不掉 loot）。
            const r2 = proto.attackRange * proto.attackRange;
            for (const t of actors) {
              if (t.kind !== EntityKind.PLAYER) continue;
              if ((t.status & EntityStatus.ALIVE) === 0) continue;
              const dx = t.x - a.x;
              const dy = t.y - a.y;
              if (dx * dx + dy * dy <= r2) {
                resolveDamage(combatState, {
                  sourceId: a.id,
                  targetId: t.id,
                  amount: 0,
                  tick: world.tick,
                  kind: a.telegraph.kind,
                  enemyDamage: proto.attackDamage,
                });
              }
            }
            a.hp = 0;
            a.status |= EntityStatus.DOWNED;
          } else if (a.enemyTypeId === "gunner_imp" && proto) {
            // 枪手弹道（M16）：applyTick 抵达 → 生成飞行弹道实体（朝最近存活玩家），
            // 不直接结算近战伤害。纪律 B：弹道命中经 ⑦ resolveDamage（唯一 hp 出口，
            // 自动尊重 IFRAME/DODGE 免伤，C11 服务端裁决）。
            // 确定性：最近玩家取「首个最小欧氏距离平方」（与敌 AI 一致，无 Math.random）。
            // 若无存活玩家（全部 DOWNED/OUT）则跳过生成，弹道不凭空出现。
            let target: Actor | null = null;
            let bestSq = Infinity;
            for (const t of actors) {
              if (t.kind !== EntityKind.PLAYER) continue;
              if (!isOutEligibleTarget(t.status)) continue; // 已倒地/出局不锁定
              const dx = t.x - a.x;
              const dy = t.y - a.y;
              const dSq = dx * dx + dy * dy;
              if (dSq < bestSq) {
                bestSq = dSq;
                target = t;
              }
            }
            if (target) {
              const dx = target.x - a.x;
              const dy = target.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const PROJ_SPEED = 320 / 30; // px/tick（~320px/s 飞行速度）
              projectiles.push({
                id: projSeq++,
                x: a.x,
                y: a.y,
                vx: (dx / len) * PROJ_SPEED,
                vy: (dy / len) * PROJ_SPEED,
                ownerId: a.id,
                damage: proto.attackDamage, // 扁平弹道伤害（取原型 attackDamage）
                bornTick: world.tick,
                expireTick: world.tick + 70, // ~2.33s @30Hz 寿命（含穿场地牢余量）
                radius: 9,
              });
            }
          } else {
            // RANGE-BALANCE（2026-08-12）：
            //   * 玩家近战 → 「前向扇形 AOE」：命中「朝向 ±60°、距离 ≤ PLAYER_ATTACK_RANGE」的所有存活
            //     敌人（参考暗黑/VS 近战 AOE，割草清屏核心爽感）。方向来自 telegraph.dir（客户端 aimDir）。
            //   * 敌人近战 → 保持单体命中 telegraph.targetId（原逻辑；敌人目标=玩家，扇形无意义）。
            //   确定性：遍历 actors 数组顺序（无随机源）；对同一批目标逐个结算。
            const enemyDamage =
              a.enemyTypeId != null ? ENEMY_PROTOTYPES[a.enemyTypeId].attackDamage : undefined;
            const isPlayerSwing = a.kind === EntityKind.PLAYER;
            if (!isPlayerSwing) {
              // ── 敌人近战：单体命中锁定目标（原逻辑不变）──
              const target = actors.find(
                (t) => t.id === a.telegraph!.targetId && (t.status & EntityStatus.ALIVE) !== 0,
              );
              if (target) {
                resolveDamage(combatState, {
                  sourceId: a.id,
                  targetId: target.id,
                  amount: 0,
                  tick: world.tick,
                  kind: a.telegraph.kind,
                  enemyDamage,
                });
                // AFFIX（P1）：lifesteal 精英攻击命中玩家 → 回复 2 HP（需玩家仍存活）。
                //   确定性：仅本敌人 hp 增减，无随机源。
                if (a.affix === "lifesteal" && (target.status & EntityStatus.ALIVE) !== 0) {
                  a.hp = Math.min(a.maxHp, a.hp + 2);
                }
                // 死亡掉落（仅敌人/boss；玩家倒地不掉落）：hp≤0 且刚置 DOWNED → 确定性生 loot。
                if (
                  (target.kind === EntityKind.ENEMY || target.kind === EntityKind.BOSS) &&
                  target.hp <= 0 &&
                  (target.status & EntityStatus.DOWNED) !== 0
                ) {
                  trySpawnLoot(target, world.tick);
                  if (a.kind === EntityKind.PLAYER) {
                    const proto = ENEMY_PROTOTYPES[target.enemyTypeId ?? ""];
                    const xpGain = proto?.tier === "boss" ? 80 : proto?.tier === "elite" ? 18 : 6;
                    grantXp(a, xpGain);
                  }
                }
              }
            } else {
              // ── 玩家近战：前向扇形 AOE ──
              // 扇形方向优先用「主目标实时方向」（移动中玩家甩开目标时，AOE 应跟随当前朝向，
              //   telegraph.dir 是启动时朝向可能已过时）；主目标不存在/同点则回退 telegraph.dir。
              const mt = actors.find((t) => t.id === a.telegraph!.targetId);
              let fx = 1, fy = 0;
              if (mt && Math.hypot(mt.x - a.x, mt.y - a.y) > 1) {
                const pl = Math.hypot(mt.x - a.x, mt.y - a.y);
                fx = (mt.x - a.x) / pl; fy = (mt.y - a.y) / pl;
              } else {
                const coneDir = a.telegraph!.dir;
                if (coneDir && (coneDir.x !== 0 || coneDir.y !== 0)) {
                  const cl = Math.hypot(coneDir.x, coneDir.y) || 1;
                  fx = coneDir.x / cl; fy = coneDir.y / cl;
                }
              }
              const coneCos = Math.cos(PLAYER_ATTACK_CONE_RAD); // cos(60°)≈0.5 → ±60°
              // BUILD-UP（P1）：范围强化 perk → AOE 射程 ×perkRangeMult（与触发校验一致）。
              const aRangePx = PLAYER_ATTACK_RANGE * (a.perkRangeMult ?? 1);
              const rangeSq = aRangePx * aRangePx;
              const mainTargetId = a.telegraph!.targetId;
              const hit = (t: Actor): boolean => {
                if (t.kind !== EntityKind.ENEMY && t.kind !== EntityKind.BOSS) return false; // 只打敌人/BOSS
                if ((t.status & EntityStatus.ALIVE) === 0) return false;
                const dx = t.x - a.x, dy = t.y - a.y;
                const dSq = dx * dx + dy * dy;
                if (dSq > rangeSq) return false; // 超出射程
                // 主目标（telegraph.targetId）：锁定必中（保留原单体行为——移动中玩家甩开目标时
                //   AOE 扇形判定会把它排到背后 → 必须豁免，否则走A会莫名落空）。
                if (t.id === mainTargetId) return true;
                const dot = dx * fx + dy * fy;
                if (dSq > 0 && dot < 0) return false; // 背面排除（dot<0）
                if (dot * dot < coneCos * coneCos * dSq) return false; // 超出半角（|cos|<cos60）
                return true;
              };
              for (const target of actors) {
                if (!hit(target)) continue;
                // CRIT（P2）：玩家普攻 15% 暴击 ×1.5（确定性 seed：来源+目标+当前 tick，无随机源）。
                //   参考暗黑/VS 暴击系统——触发时伤害大增 + 客户端大数字反馈。
                const critRoll = new Rng(
                  hashString64(`crit:${a.id}:${target.id}:${world.tick}`),
                );
                const critMult = critRoll.nextInt(0, 99) < 15 ? 1.5 : undefined;
                resolveDamage(combatState, {
                  sourceId: a.id,
                  targetId: target.id,
                  amount: 0,
                  tick: world.tick,
                  kind: a.telegraph.kind,
                  enemyDamage,
                  critMult,
                });
                // KNOCKBACK（P0-1）：玩家近战命中敌人 → 击退位移 + 硬直（割草"砍飞"反馈）。
                //   - 方向 = 攻击者→目标单位向量（命中几何，无随机，确定性）
                //   - 位移 26px、硬直 4 tick（@30Hz ≈0.13s）
                //   - 仅存活敌人；boss 击退减半（防止被打飞破坏走位）
                //   - 已处击退窗口的目标重置窗口（连续命中保持压制）
                if (
                  target.kind === EntityKind.ENEMY &&
                  (target.status & EntityStatus.ALIVE) !== 0 &&
                  (target.status & EntityStatus.DOWNED) === 0
                ) {
                  const kdx = target.x - a.x, kdy = target.y - a.y;
                  const kl = Math.hypot(kdx, kdy);
                  const kbScale = target.kind === EntityKind.BOSS ? 0.5 : 1;
                  if (kl > 1) {
                    target.kbUntilTick = world.tick + KNOCKBACK_TICKS;
                    target.kbDirX = (kdx / kl) * kbScale;
                    target.kbDirY = (kdy / kl) * kbScale;
                  } else {
                    // 目标与攻击者重叠（极小概率）：用攻击朝向兜底
                    target.kbUntilTick = world.tick + KNOCKBACK_TICKS;
                    target.kbDirX = fx * kbScale;
                    target.kbDirY = fy * kbScale;
                  }
                }
                // 死亡掉落 + 升级
                if (
                  (target.kind === EntityKind.ENEMY || target.kind === EntityKind.BOSS) &&
                  target.hp <= 0 &&
                  (target.status & EntityStatus.DOWNED) !== 0
                ) {
                  trySpawnLoot(target, world.tick);
                  const proto = ENEMY_PROTOTYPES[target.enemyTypeId ?? ""];
                  const xpGain = proto?.tier === "boss" ? 80 : proto?.tier === "elite" ? 18 : 6;
                  grantXp(a, xpGain);
                  // BUILD-UP（P1）：汲取 perk → 击杀回 3 HP（割草续航；确定性，无随机源）。
                  if (a.perks && a.perks.includes("lifesteal_up")) {
                    a.hp = Math.min(a.maxHp, a.hp + 3);
                  }
                }
              }
            }
          }
          a.telegraph = null; // 一次性结算后清除前摇
        }
      }

      // ── M16 飞行弹道步进（确定性；固定速度位移 + 碰撞 + 过期清理）──
      // 置于实体移动（上方首循环）之后、brute 狂暴扫描之前；applyTick 本 tick 新生成的弹道
      // 当 tick 即步进一次（确定性，无随机源）。碰撞经 ⑦ resolveDamage（纪律 B）。
      stepProjectiles(combatState);

      // ── brute_charger 狂暴生怪（enrage；确定性，seed 由 charger id + tick）──
      // 每 tick 扫描：brute_charger 血量跌破 50% maxHp 且尚未 enraged → 置 enraged=true
      // 并经 spawnChargerAdd 确定性生成恰好 1 只 grunt_swarm 近怪。guard（enraged）确保每个
      // charger 仅触发一次，完全确定性（无 Date/Math.random）。新增实体落入 actors 尾部，
      // 本 tick 不再被上方移动/AI 循环处理，下一 tick 才参与模拟。
      for (const a of actors) {
        if (
          a.enemyTypeId === "brute_charger" &&
          !a.enraged &&
          a.maxHp > 0 &&
          a.hp > 0 &&
          a.hp < a.maxHp * 0.5
        ) {
          a.enraged = true;
          spawnChargerAdd(a, world.tick);
        }
      }

      // ── E7.S7.2–S7.7 倒地/救援/超时/托管（仅 PLAYER；敌人倒地由 ⑦ 接管，此处不处理）──
      for (const a of actors) {
        if (a.kind !== EntityKind.PLAYER) continue;
        if ((a.status & EntityStatus.DOWNED) === 0) continue;
        // S7.6 三者同发：断线 → 跳过本玩家 tick（上方已排除）+ 暂停 DOWNED/救援计时。
        // 不推进 downedTicks/rescueTicks，保证重连「无跳变、不误判 OUT」（D8 / P4 保底）。
        if (a.disconnected) continue;

        a.downedTicks += 1;

        // S7.5 超时 → OUT：仅超时触发；OUT 后本 run 作旁观，world reset 才清（sim-core 仅持有）。
        if (a.downedTicks >= DOWNED_TIMEOUT_TICKS) {
          a.status = (a.status & ~EntityStatus.DOWNED) | EntityStatus.OUT;
          a.rescueTicks = 0;
          a.downedTicks = 0;
          continue;
        }

        // 候选救援者：其他 ALIVE、非 DOWNED、非 OUT、非断线的 PLAYER（rescue.ts 纯过滤）。
        const candidates = rescueCandidates(a.id, actors);
        if (candidates.length > 0) {
          // S7.2：有队友 → 邻近则累积救援读条；不邻近则保持（不衰减）。
          if (withinRescueRadius(a, candidates)) {
            a.rescueTicks += 1;
            if (a.rescueTicks >= RESCUE_TICKS) {
              // 救援成功：清 DOWNED，恢复到 revivalHp，重置计时。
              a.status &= ~EntityStatus.DOWNED;
              a.hp = revivalHp(a.maxHp);
              a.rescueTicks = 0;
              a.downedTicks = 0;
            }
          }
          // 否则 rescueTicks 保持（不衰减，符合 S7.2）。
        } else {
          // S7.2 降级分支：无队友 → SOLO_SELF_RESCUE_TICKS 后自动复活（1hp 降级态）。
          if (a.downedTicks >= SOLO_SELF_RESCUE_TICKS) {
            a.status &= ~EntityStatus.DOWNED;
            a.hp = 1; // 降级：最低可行动血量
            a.rescueTicks = 0;
            a.downedTicks = 0;
          }
        }
      }

      // ── 掉落拾取（progression/feedback；仅 ALIVE 玩家消费 loot）──
      // 确定性：仅几何邻近判定 + 固定效果，无随机源；已消费的 loot 从 actors 移除。
      {
        const r2 = PICKUP_RADIUS * PICKUP_RADIUS;
        const consumed = new Set<number>();
        for (const a of actors) {
          if (a.kind !== EntityKind.PLAYER) continue;
          if ((a.status & EntityStatus.ALIVE) === 0) continue; // 仅存活玩家可拾取
          for (const l of actors) {
            if (l.kind !== EntityKind.LOOT) continue;
            if (consumed.has(l.id)) continue;
            const dx = l.x - a.x;
            const dy = l.y - a.y;
            if (dx * dx + dy * dy > r2) continue;
            // 按 lootType 结算：medkit 治疗（钳 maxHp）；buff 临时攻击增幅；ammo no-op。
            if (l.lootType === 0) {
              a.hp = Math.min(a.maxHp, a.hp + (l.value ?? 0));
            } else if (l.lootType === 2) {
              a.buffUntilTick = world.tick + LOOT_BUFF_TICKS;
              a.buffMult = 1 + LOOT_BUFF_MULT;
            }
            // lootType===1 (ammo)：no-op（仅移除）
            consumed.add(l.id);
          }
        }
        if (consumed.size > 0) {
          // 倒序 splice 移除已消费 loot，避免索引错位。
          for (let i = actors.length - 1; i >= 0; i--) {
            if (consumed.has(actors[i].id)) actors.splice(i, 1);
          }
        }
      }

      // ── 清理 + 波次推进（progression）── 仅在生成敌人时启用；
      // spawnEnemies===false（隔离 ⑪/⑧ 单元测试）时整体关闭，world 保持无敌人、roomPhase 不变。
      if (spawnEnemiesEnabled) {
        // 清理：移除已倒地(死亡)的敌人/Boss 实体（progression 前置；掉落已在结算时生成）。
        // 确定性：仅按 status 位过滤，无随机源。死亡敌人清出 actors 后，aliceEnemies 才归零以推进波次。
        for (let i = actors.length - 1; i >= 0; i--) {
          const a = actors[i];
          if (
            (a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS) &&
            (a.status & EntityStatus.DOWNED) !== 0
          ) {
            actors.splice(i, 1);
          }
        }

        // ── 波次推进（progression；确定性）──
        const aliveEnemies = actors.filter(
          (a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS,
        ).length;
        if (intermissionUntilTick > 0) {
          if (world.tick >= intermissionUntilTick) {
            intermissionUntilTick = 0;
            // S2 逐层下行：进入新楼层时更新 currentFloor（wave→floor 由 layout.floorOfWave 映射）。
            const nf = layout.floorOfWave[currentWave + 1] ?? currentFloor;
            const prevFloor = currentFloor;
            currentFloor = nf;
            // ROUTE-PICK（P3）：真的进入新楼层（floor↑）且非最后一层 → 弹「下一层路线选择」，
            //   等玩家 CHOOSE_FLOOR 后 spawnWave（Hades 房间选择）。
            const hasNextFloor = nf > prevFloor;
            if (hasNextFloor && currentWave + 1 < maxWave) {
              openFloorRoute(nf);
              if (pendingFloorRoute) {
                // 等待玩家选择；snapshot 下发 floorChoice → 客户端弹 UI → CHOOSE_FLOOR。
                // world 继续步进（选择动作在输入 drain 处理），但 spawn 延后。
              } else {
                spawnWave(currentWave + 1);
              }
            } else {
              spawnWave(currentWave + 1);
            }
          }
        } else if (aliveEnemies === 0) {
          if (currentWave < maxWave) {
            intermissionUntilTick = world.tick + WAVE_INTERMISSION_TICKS;
            // S2 层间「商」点：进入新楼层前的过渡期，生成本层三选一 perk 池（确定性 Rng）。
            // 首层（floor 1）不弹（开局无 Build），此后每层过渡弹一次；同层防重复。
            const nextFloor = layout.floorOfWave[currentWave + 1] ?? currentFloor;
            if (nextFloor > lastPerkFloor && nextFloor > 1) {
              lastPerkFloor = nextFloor;
              const prng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:perk:${nextFloor}`));
              const pool = [...PERK_POOL];
              perkChoicesState = [];
              for (let i = 0; i < PERK_CHOICES_PER_FLOOR && pool.length > 0; i += 1) {
                const idx = prng.nextInt(0, pool.length - 1);
                perkChoicesState.push(pool[idx]);
                pool.splice(idx, 1);
              }
              pickedPerkThisOffer.clear();
            }
          } else {
            currentRoomPhase = RoomPhase.SETTLE; // 通关
          }
        }

        // S2 商点生命周期：所有「在场玩家」都选完后清空池（否则客户端 overlay 循环弹）。
        // 「在场」= 未断线玩家；断线玩家不计入（避免卡死等待永远不选的人）。
        if (perkChoicesState.length > 0) {
          const present = actors.filter(
            (a) =>
              a.kind === EntityKind.PLAYER &&
              a.ownerId !== undefined &&
              !a.disconnected,
          );
          const allPicked = present.every((a) => pickedPerkThisOffer.has(a.ownerId!));
          if (allPicked) perkChoicesState = [];
        }
      }

      world.tick += 1;
    },
    snapshot(): WorldSnapshot {
      const entities: EntityState[] = actors.map((a) => {
        // N2：方向性 telegraph（CONE/LINE）携带攻击者朝向单位向量；RING/AOE_FILL 径向对称省略。
        // RANGE-BALANCE-FIX：玩家近战是「前向扇形 AOE」（±60°、130px）——telegraph 必须画成 CONE
        //   与判定一致，而不是 RING（360° 大圆）——否则视觉上"人物脚下 260px 大圈"把攻击范围
        //   误显示成人物范围，玩家分不清哪里能打到。
        // BOSS-MULTI-SKILL（P2）：火焰新星 telegraph → AOE_FILL（实心火圈），radius=novaRadius。
        const shape =
          a.telegraph && a.telegraph.novaRadius != null
            ? TelegraphShape.AOE_FILL
            : a.enemyTypeId != null
              ? ENEMY_PROTOTYPES[a.enemyTypeId].shape
              : TelegraphShape.CONE;
        const isDirectional = shape === TelegraphShape.CONE || shape === TelegraphShape.LINE;
        // 方向性 telegraph 的朝向：优先用「攻击方向」（玩家 CONE 是前向扇形，方向存于 telegraph.dir，
        //   由攻击 input 的 aimDir 提供，静止攻击也正确朝目标）；无攻击方向才退回 Actor 朝向。
        //   （径向形状 RING/AOE_FILL 置 undefined，JSON 丢弃，不影响哈希。）
        let teleDir: Vec2 | undefined;
        if (isDirectional) {
          if (a.telegraph && a.telegraph.dir && (a.telegraph.dir.x !== 0 || a.telegraph.dir.y !== 0)) {
            const dl = Math.hypot(a.telegraph.dir.x, a.telegraph.dir.y) || 1;
            teleDir = { x: a.telegraph.dir.x / dl, y: a.telegraph.dir.y / dl };
          } else {
            teleDir = dirToVector(a.dir);
          }
        }
        return {
        id: a.id,
        kind: a.kind,
        pos: { x: a.x, y: a.y },
        dir: a.dir,
        hp: a.hp,
        maxHp: a.maxHp,
        status: a.status,
        statusEffects: [],
        ownerId: a.ownerId,
        classId: a.classId,
        enemyTypeId: a.enemyTypeId,
        // AFFIX（P1 精英词缀）：仅 elite 下发（grunt/boss undefined → JSON 丢弃，golden 无损）。
        affix: a.affix ?? undefined,
        // S7.2 救援读条：仅倒地「玩家」附带（敌人倒地不进救援系统；undefined 不影响确定性快照哈希）。
        rescue:
          a.kind === EntityKind.PLAYER && (a.status & EntityStatus.DOWNED) !== 0
            ? {
                targetId: a.id,
                progressTicks: a.rescueTicks,
                totalTicks: RESCUE_TICKS,
                // O3 倒地已过 tick（客户端算「自动复活 / OUT 超时」倒计时；仅倒地玩家下发，
                // 与其他 rescue 字段一致——未倒地实体 rescue 为 undefined，JSON 丢弃，golden 无损）。
                downedTicks: a.downedTicks,
              }
            : undefined,
        // ── E8 / D12 快照序列化（READ-ONLY；纪律 B：绝不改 hp/status，仅公开已存在的权威状态）──
        // 仅当实体真实持有该状态才下发对应字段，否则赋 undefined（JSON.stringify 自动丢弃 undefined
        // 键），故「未持有状态的实体」其确定性哈希不受影响——与 rescue 先例完全一致。
        // D/telegraph 可视化：将运行时 AttackWindup 转换为客户端可读的 TelegraphState
        // （含 shape/color/radius，EntityView.gd 据 radius 缩放预警图形）。
        telegraph:
          a.telegraph != null
            ? {
                shape,
                color: DANGER_COLOR,
                startTick: a.telegraph.startTick,
                applyTick: a.telegraph.applyTick,
                // 危险区半径：火焰新星取 novaRadius；敌人取原型 attackRange；玩家普攻预警 = 实际射程。
                radius:
                  a.telegraph && a.telegraph.novaRadius != null
                    ? a.telegraph.novaRadius
                    : a.enemyTypeId != null
                      ? ENEMY_PROTOTYPES[a.enemyTypeId].attackRange
                      : PLAYER_ATTACK_RANGE,
                // N2：方向性形状（CONE/LINE）填充攻击者 facing 单位向量；RING/AOE_FILL 省略（undefined）。
                dir: teleDir,
              }
            : undefined,
        // ⑨ SHIELD_ALLY 减伤护盾：仅护盾窗口仍活跃（> world.tick）才下发，过期则 undefined。
        shieldUntilTick:
          a.shieldUntilTick != null && a.shieldUntilTick > world.tick
            ? a.shieldUntilTick
            : undefined,
        shieldReduction:
          a.shieldUntilTick != null && a.shieldUntilTick > world.tick
            ? a.shieldReduction
            : undefined,
        // ⑨ TAUNT 施法者吸引敌火窗口：仅窗口仍活跃（> world.tick）才下发，过期则 undefined。
        tauntUntilTick:
          a.tauntUntilTick != null && a.tauntUntilTick > world.tick
            ? a.tauntUntilTick
            : undefined,
        // C4b 猎手标记易伤窗口：仅窗口仍活跃（> world.tick）才下发，过期/未标记则 undefined（JSON 丢弃，
        // 不影响「未标记实体」的确定性快照哈希——与 rescue/telegraph/shield/taunt/enraged 先例一致）。
        markedUntilTick:
          a.markedUntilTick != null && a.markedUntilTick > world.tick
            ? a.markedUntilTick
            : undefined,
        // 当前/最近施放协作技 id（E8 HUD 提示）。玩家初值 null → undefined → 不下发。
        activeSkill: a.activeSkill ?? undefined,
        // M12：狂暴标记（与 rescue/telegraph 先例一致）。仅当 a.enraged===true 才下发 true，
        // 否则 undefined → JSON.stringify 丢弃键；「未狂暴实体」字节表示不变，确定性哈希不受影响。
        enraged: a.enraged === true ? true : undefined,
        // 掉落（progression/feedback）：仅 loot 实体携带 lootType/value；其他实体为 undefined → 不下发。
        lootType: a.lootType,
        value: a.value,
        // S2 局内 Build（perk）：仅玩家已选 perk 才下发对应字段，未选 → undefined → JSON 丢弃
        // （不影响「无 perk 玩家」的确定性哈希，与 rescue/telegraph 先例一致）。
        perks:
          a.perks && a.perks.length > 0 ? (a.perks as readonly string[]) : undefined,
        perkDamageMult: a.perkDamageMult ?? undefined,
        perkSpeedMult: a.perkSpeedMult ?? undefined,
        perkMaxHpBonus: a.perkMaxHpBonus ?? undefined,
        // ── G1 升级（仅玩家下发 level/xp；敌人 undefined → JSON 丢弃，golden 无损）──
        level: a.level ?? undefined,
        xp: a.xp ?? undefined,
        // G2 Buff 持续收益：拾取 LOOT buff 的窗口截止 tick（客户端 HUD 显示剩余秒/倍率）。
        buffUntilTick:
          a.buffUntilTick != null && a.buffUntilTick > world.tick
            ? a.buffUntilTick
            : undefined,
        buffMult: a.buffMult ?? undefined,
        // G1 升级特效：本 tick 升级次数（客户端播放金光特效；0/undefined 不下发）。
        levelUpCount:
          a.levelUpCount != null && a.levelUpCount > 0 ? a.levelUpCount : undefined,
        };
      });
      const enemiesRemaining = entities.filter(
        (e) => e.kind === EntityKind.ENEMY || e.kind === EntityKind.BOSS,
      ).length;
      return {
        type: "snapshot", // C2：数据面路由标记，客户端据 type 区分快照/控制/房间消息（纯新增，旧字段不变）。
        tick: world.tick,
        runId: world.runId,
        roomPhase: world.roomPhase,
        wave: currentWave,
        totalWaves: maxWave,
        intermissionTicks: Math.max(0, intermissionUntilTick - world.tick),
        enemiesRemaining,
        // S2 逐层下行（顶层字段 → golden 仅哈希 entities，不影响确定性）。
        floor: currentFloor,
        totalFloors: layout.floorSequence.length,
        // S2 三选一 Build 可选池（层间「商」点弹出时非空；无商点时空数组）。
        perkChoices: perkChoicesState,
        // ROUTE-PICK（P3）：层间路线选择（intermission 后未决策时非空；客户端弹 UI → CHOOSE_FLOOR）。
        floorChoice: pendingFloorRoute ? pendingFloorRoute.options : null,
        activeRoute: activeFloorRoute ?? null,
        entities,
        // M16：飞行弹道瞬态实体（顶层字段，独立于 entities；golden 仅哈希 entities，故 golden 安全）。
        projectiles: projectiles.map((p) => ({
          id: p.id,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          ownerId: p.ownerId,
          damage: p.damage,
          radius: p.radius,
        })),
        lastProcessedSeq: inputs.lastProcessedSeq(),
      };
    },
    setDisconnected(playerId: number, disconnected: boolean) {
      const a = actors.find((x) => x.kind === EntityKind.PLAYER && x.ownerId === playerId);
      if (!a) return;
      if (disconnected && !a.disconnected) {
        // S7.6 三者同发：置位 disconnected + 抓拍 PersonalState（单次持有，重连前不被覆盖）。
        // 剩余窗口由 downedRemainingTicks 推算，供 room-service（C3/C10）下发重连还原（D8）。
        a.personalState = capturePersonalState(
          playerId,
          a.status,
          a.hp,
          a.downedTicks,
          a.rescueTicks,
        );
      }
      a.disconnected = disconnected;
    },
    applyPerk(playerId: number, perkId: string) {
      // S2 局内 Build：服务端权威落地（纪律 B——仅 world 授权路径改实体状态）。
      // 仅当处于「商」点窗口（perkChoices 非空）且 perkId 在可选池中且本玩家尚未选择才生效。
      if (perkChoicesState.length === 0) return false;
      if (!perkChoicesState.includes(perkId)) return false;
      if (pickedPerkThisOffer.has(playerId)) return false;
      const pl = actors.find((x) => x.kind === EntityKind.PLAYER && x.ownerId === playerId);
      if (!pl) return false;
      const def = PERK_CATALOG[perkId];
      if (!def) return false;
      // 落地：写入 perk 状态（伤害/移速/冷却/攻速/范围由 combat/world 消费；生命立即生效并同步 hp）。
      pl.perks = pl.perks ? [...pl.perks, perkId] : [perkId];
      if (perkId === "dmg_up") pl.perkDamageMult = 1.15;
      else if (perkId === "spd_up") pl.perkSpeedMult = 1.12;
      else if (perkId === "cdr_up") pl.perkCdr = 0.15;
      else if (perkId === "atkspd_up") pl.perkAtkspd = 0.75; // 前摇 -25%
      else if (perkId === "range_up") pl.perkRangeMult = 1.25; // 范围 +25%
      else if (perkId === "hp_up") {
        pl.perkMaxHpBonus = (pl.perkMaxHpBonus ?? 0) + 20;
        pl.maxHp += 20;
        pl.hp = Math.min(pl.maxHp, pl.hp + 20); // 立即同步：上限与当前血都 +20
      }
      pickedPerkThisOffer.add(playerId);
      return true;
    },
    skipPerk(playerId: number) {
      // S2 逃生口：商点窗口内标记该玩家已决策（等价于「选一个」但不写 perk）。
      if (perkChoicesState.length === 0) return false;
      if (pickedPerkThisOffer.has(playerId)) return true; // 已决策（选过或跳过的幂等）
      const pl = actors.find((x) => x.kind === EntityKind.PLAYER && x.ownerId === playerId);
      if (!pl) return false;
      pickedPerkThisOffer.add(playerId);
      return true;
    },
    perkChoices() {
      return perkChoicesState;
    },
    // S2 测试钩子（仅测试用；生产不暴露）：强制开一个「商」点窗口（确定性三选一）。
    // 用于 S2 单元测试验证 applyPerk 机制，避免依赖「真实推进到 floor 2」（怪海下单刷会死）。
    __debugForcePerkOffer() {
      const prng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:test-perk`));
      const pool = [...PERK_POOL];
      perkChoicesState = [];
      for (let i = 0; i < PERK_CHOICES_PER_FLOOR && pool.length > 0; i += 1) {
        const idx = prng.nextInt(0, pool.length - 1);
        perkChoicesState.push(pool[idx]);
        pool.splice(idx, 1);
      }
      pickedPerkThisOffer.clear();
      lastPerkFloor = Number.MAX_SAFE_INTEGER; // 防后续楼层过渡覆盖
      return perkChoicesState;
    },
    floor() {
      return currentFloor;
    },
    totalFloors() {
      return layout.floorSequence.length;
    },
  };

  return world;
}
