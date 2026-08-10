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
  // ── brute_charger 狂暴（enrage；血量破 50% 一次性生 1 只 grunt add，guard 防重复）──
  enraged?: boolean; // 触发狂暴后置 true（undefined → JSON 丢弃，不影响确定性快照哈希，与 phase 同先例）
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
}

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
    for (const sp of layout.spawnPoints) {
      if (sp.wave !== n) continue;
      const proto = ENEMY_PROTOTYPES[sp.enemyTypeId];
      for (let i = 0; i < sp.count; i += 1) {
        const hp = wrng.nextInt(proto.hpMin, proto.hpMax);
        const kind = proto.tier === "boss" ? EntityKind.BOSS : EntityKind.ENEMY;
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
          enraged: undefined,
          rescueTicks: 0,
          downedTicks: 0,
          disconnected: false,
          personalState: null,
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
        // ── E8 协作技初始状态（仅玩家持有；敌人不施技，字段保持 undefined）──
        cooldownUntilTick: 0,
        activeSkill: null,
        shieldUntilTick: 0,
        shieldReduction: 0,
        tauntUntilTick: 0,
      });
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
            const ms = moveSpeedPerTick(a.classId!);
            a.x += cmd.dir.x * ms;
            a.y += cmd.dir.y * ms;
            // N2：仅当真正移动（位移非 0）才更新朝向，保持静止时的上次朝向（不重置）。
            if (cmd.dir.x !== 0 || cmd.dir.y !== 0) a.dir = vecToDir8(cmd.dir);
          } else if (cmd.action === InputAction.ATTACK) {
            // 战斗意图：启动前摇（D12）。若已有进行中前摇则忽略（防覆盖/刷新）。
            if (!a.telegraph) {
              a.telegraph = {
                startTick: world.tick,
                applyTick: world.tick + MIN_TELEGRAPH_TICKS,
                targetId: cmd.target ?? a.id,
                kind: CombatKind.ATTACK,
              };
            }
          } else if (cmd.action === InputAction.SKILL) {
            // E8 / O-A 闭合：协作技路由。skills.ts 纯校验 + 效果数学产出 SkillApplication
            // 意图；本处（world.step）落地——所有 hp/status 改变只经 combat/world（纪律 B）。
            // 冷却门控：冷却未结束直接忽略（不进入冷却、不落地）。
            if ((a.cooldownUntilTick ?? 0) <= world.tick) {
              const target =
                cmd.target != null ? actors.find((t) => t.id === cmd.target) ?? null : null;
              const skillId = cmd.param ?? SKILL_IDS.SHIELD_ALLY;
              const app = resolveSkillApplication(
                { id: a.id, kind: a.kind, status: a.status, disconnected: a.disconnected, classId: a.classId },
                target, skillId, world.tick,
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
                a.cooldownUntilTick = world.tick + app.cooldownTicks;
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
          }

          if (intent.type === "MOVE") {
            // 敌人移速按 ENEMY_PROTOTYPES.speed / 30（每 tick 位移，平衡初稿）；Boss 阶段叠加倍率。
            const proto = ENEMY_PROTOTYPES[a.enemyTypeId!];
            const ms = (proto.speed / 30) * speedMult;
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
          if (a.enemyTypeId === "bomber_imp" && proto) {
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
            const target = actors.find(
              (t) => t.id === a.telegraph!.targetId && (t.status & EntityStatus.ALIVE) !== 0,
            );
            if (target) {
              // E6：敌人来源 → 伤害取 ENEMY_PROTOTYPES 平衡初稿（world 经意图提交的 enemyDamage）；
              //     玩家来源 → PLAYER_ATTACK_DAMAGE（resolveDamage 内裁决，C11 忽略 amount）。
              const enemyDamage =
                a.enemyTypeId != null ? ENEMY_PROTOTYPES[a.enemyTypeId].attackDamage : undefined;
              resolveDamage(combatState, {
                sourceId: a.id,
                targetId: target.id,
                amount: 0,
                tick: world.tick,
                kind: a.telegraph.kind,
                enemyDamage,
              });
              // 死亡掉落（仅敌人/boss；玩家倒地不掉落）：hp≤0 且刚置 DOWNED → 确定性生 loot。
              if (
                (target.kind === EntityKind.ENEMY || target.kind === EntityKind.BOSS) &&
                target.hp <= 0 &&
                (target.status & EntityStatus.DOWNED) !== 0
              ) {
                trySpawnLoot(target, world.tick);
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
            spawnWave(currentWave + 1);
          }
        } else if (aliveEnemies === 0) {
          if (currentWave < maxWave) {
            intermissionUntilTick = world.tick + WAVE_INTERMISSION_TICKS;
          } else {
            currentRoomPhase = RoomPhase.SETTLE; // 通关
          }
        }
      }

      world.tick += 1;
    },
    snapshot(): WorldSnapshot {
      const entities: EntityState[] = actors.map((a) => {
        // N2：方向性 telegraph（CONE/LINE）携带攻击者朝向单位向量；RING/AOE_FILL 径向对称省略。
        const shape =
          a.enemyTypeId != null
            ? ENEMY_PROTOTYPES[a.enemyTypeId].shape
            : TelegraphShape.RING;
        const isDirectional = shape === TelegraphShape.CONE || shape === TelegraphShape.LINE;
        // 攻击者 facing（Actor.dir 0-7）→ 单位向量；径向形状置 undefined（JSON 丢弃，不影响哈希）。
        const teleDir: Vec2 | undefined = isDirectional ? dirToVector(a.dir) : undefined;
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
        // S7.2 救援读条：仅倒地「玩家」附带（敌人倒地不进救援系统；undefined 不影响确定性快照哈希）。
        rescue:
          a.kind === EntityKind.PLAYER && (a.status & EntityStatus.DOWNED) !== 0
            ? { targetId: a.id, progressTicks: a.rescueTicks, totalTicks: RESCUE_TICKS }
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
                // 危险区半径：敌人取原型 attackRange；玩家普攻预警半径初稿（待 P5 调优）。
                radius:
                  a.enemyTypeId != null
                    ? ENEMY_PROTOTYPES[a.enemyTypeId].attackRange
                    : 40,
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
  };

  return world;
}
