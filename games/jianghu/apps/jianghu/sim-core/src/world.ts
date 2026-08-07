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
  ENEMY_ATTACK_INTERVAL_TICKS,
  ENEMY_CONTACT_RANGE,
  PICKUP_RADIUS,
  BOSS_PHASE_THRESHOLD,
  BOSS_PHASE2_ATTACK_INTERVAL_TICKS,
  DEFAULT_RESPAWN_TICKS,
  RESPAWN_POS,
  LOOT_GROUND_TTL_TICKS,
  ENEMY_BASE_ATK,
  ENTRANCE_COOLDOWN_TICKS, // E5：入口冷却（C-Dgn-4）
} from "./constants.ts"; // C7 单一来源
import { Rng } from "./rng.ts";
import { stepMovement } from "./movement.ts"; // E3 真移动（纯函数）
import { resolveDamage, resolveSkill } from "./combat.ts"; // E4 服务端权威结算
import { spawnWave, nextRespawnTick, type SpawnZone } from "./spawning.ts"; // E4 确定性实例化
import { rollLoot } from "./loot.ts"; // E4 掉落
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
}

/** 拾取事件（地面掉落被玩家拾取）。 */
export interface PickupEvent {
  readonly seatId: number;
  readonly loot: LootResult;
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
  /** 在权威世界 spawn 一个玩家实体（幂等：重复 seatId 不叠加）。 */
  addPlayer(seatId: number, userId: string, spawn?: Vec2): void;
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
  /** 推进一个权威 tick（确定性：刷怪/战斗/掉装/拾取/漂浮 + 玩家权威移动）。 */
  step(): void;
  /** 取当前权威快照。 */
  snapshot(): WorldSnapshot;
  /** 只读 actor 视图（测试/调试用）。 */
  actors(): readonly Actor[];
  /** 取出并清空拾取事件缓冲（服务端应用背包用）。 */
  consumePickups(): PickupEvent[];
  /** 在指定 seat 玩家脚下生成地面掉落实体（背包满溢出回落，C-Per-3）。 */
  spawnGroundLoot(seatId: number, loot: LootState): void;
  /** 可选：每次拾取即时回调（run-manager 可设，替代轮询 consumePickups）。 */
  onPickup?: (seatId: number, loot: LootResult) => void;
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

/** 敌人 tier 索引 → 名称（rollLoot 用）。 */
const TIER_NAMES = ["normal", "elite", "boss"] as const;

export function createWorld(opts: CreateWorldOpts): World {
  let actors: Actor[] = [];
  let nextId = 1;

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
          zoneIndex: spawnStates.length,
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
    actors.push({
      id,
      kind: EntityKind.PLAYER,
      x: (16 + p.seatId) * TILE,
      y: 15 * TILE,
      dir: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      status: EntityStatus.ALIVE,
      ownerId: p.seatId,
      skillCd: [0, 0, 0, 0],
    });
    players.set(p.seatId, id);
  }

  const world: World = {
    runId: opts.runId,
    roomId: opts.roomId,
    seed: opts.seed,
    tick: 0,
    phase: opts.phase,
    actors: () => actors.slice(),

    addPlayer(seatId: number, _userId: string, spawn?: Vec2) {
      // 幂等：重复加入不叠加实体（重连/重复 room.join 安全）。
      if (players.has(seatId)) return;
      const id = nextId++;
      // 默认出生点：复用 E1 占位公式，按 seatId 错开；% 40 防止越界（世界宽 40 tile）。
      const sx = spawn ? spawn.x : ((16 + seatId) % 40) * TILE;
      const sy = spawn ? spawn.y : 15 * TILE;
      actors.push({
        id,
        kind: EntityKind.PLAYER,
        x: sx,
        y: sy,
        dir: 0,
        hp: PLAYER_MAX_HP,
        maxHp: PLAYER_MAX_HP,
        status: EntityStatus.ALIVE,
        ownerId: seatId,
        skillCd: [0, 0, 0, 0],
      });
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

        // skillCd 递减
        if (a.skillCd) {
          for (let i = 0; i < a.skillCd.length; i++) {
            if (a.skillCd[i] > 0) a.skillCd[i] -= 1;
          }
        }

        // parry 窗口清理：windowEndTick < 当前 tick → 过期（清 PARRY_ACTIVE 位）。
        if (a.parryState && a.parryState.windowEndTick < t) {
          a.parryState = undefined;
          a.status &= ~EntityStatus.PARRY_ACTIVE;
        }

        const cmd = pending.get(seatId);
        pending.delete(seatId);

        if (cmd) {
          if (cmd.action === InputAction.MOVE) {
            const np = stepMovement(
              { x: a.x, y: a.y },
              cmd.dir,
              { speedPerTick: CELLS_PER_TICK, isBlocked },
            );
            a.x = np.x;
            a.y = np.y;
            a.dir = cmd.dir; // 朝向总是更新（撞墙也转向）
            lastMove.set(seatId, cmd); // 保留最后一条 MOVE 支撑按住移动
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
              // 对范围内敌人结算（圆形；敌人无格挡 → targetParry undefined）。
              for (const e of actors) {
                if (e.kind !== EntityKind.ENEMY && e.kind !== EntityKind.BOSS) continue;
                if (Math.hypot(e.x - a.x, e.y - a.y) <= intent.range) {
                  const dmg = resolveDamage({
                    targetId: e.id,
                    amount: 0, // C11：忽略客户端 amount，服务端按 baseAmount 裁决
                    tick: t,
                    baseAmount: intent.damage,
                    targetParry: undefined,
                  });
                  e.hp += dmg.deltaHp;
                }
              }
              a.skillCd[slot] = intent.cdTicks;
            }
          }
          // SIGNAL 等未识别 action → 忽略
        } else if (lastMove.has(seatId)) {
          // 无本 tick 输入 → 回退到保留的最后一条 MOVE（按住方向持续移动 / 抗单 tick 丢包）。
          const mv = lastMove.get(seatId)!;
          const np = stepMovement(
            { x: a.x, y: a.y },
            mv.dir,
            { speedPerTick: CELLS_PER_TICK, isBlocked },
          );
          a.x = np.x;
          a.y = np.y;
          a.dir = mv.dir;
        }
      }

      // (3) 敌人→玩家周期性接触伤害（含 parry 校验，C9/C11 服务端权威）。
      for (const e of actors) {
        if (e.kind !== EntityKind.ENEMY && e.kind !== EntityKind.BOSS) continue;
        if (e.hp <= 0) continue;
        // 锁定最近存活玩家
        let target: Actor | null = null;
        let best = Infinity;
        for (const [, actorId] of players) {
          const p = actors.find((x) => x.id === actorId);
          if (!p || p.hp <= 0) continue;
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d <= ENEMY_CONTACT_RANGE && d < best) {
            best = d;
            target = p;
          }
        }
        if (!target) continue;
        const phase2 = e.kind === EntityKind.BOSS && (e.bossPhase ?? 0) >= 1;
        const interval = phase2 ? BOSS_PHASE2_ATTACK_INTERVAL_TICKS : ENEMY_ATTACK_INTERVAL_TICKS;
        if (t - (e.lastAttackTick ?? -interval) >= interval) {
          const dmg = resolveDamage({
            targetId: target.id,
            amount: 0, // C11：忽略客户端 amount
            tick: t,
            baseAmount: e.atk ?? ENEMY_BASE_ATK,
            targetParry: target.parryState, // 玩家格挡校验
          });
          target.hp += dmg.deltaHp;
          e.lastAttackTick = t;
        }
      }

      // (4) 死亡处理：玩家复活 / 敌人掉装 + 移除 + 复活调度。
      const deadEnemyIds = new Set<number>();
      for (const e of actors) {
        if ((e.kind === EntityKind.ENEMY || e.kind === EntityKind.BOSS) && e.hp <= 0) {
          deadEnemyIds.add(e.id);
        }
      }
      // 玩家死亡 → 回安全区复活（决策④：不掉永久装备）。
      for (const a of actors) {
        if (a.kind === EntityKind.PLAYER && a.hp <= 0) {
          a.hp = PLAYER_MAX_HP;
          a.x = RESPAWN_POS.x;
          a.y = RESPAWN_POS.y;
          a.parryState = undefined;
          a.status &= ~EntityStatus.PARRY_ACTIVE;
        }
      }
      if (deadEnemyIds.size > 0) {
        for (const e of actors) {
          if (!deadEnemyIds.has(e.id)) continue;
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
              zoneIndex: zi,
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
          // 玩家：回填 ownerId（seatId 映射）+ 条件字段 parryState / skillCd。
          ...(a.ownerId !== undefined ? { ownerId: a.ownerId } : {}),
          ...(a.ownerId !== undefined && a.parryState
            ? { parryState: { active: a.parryState.active, windowEndTick: a.parryState.windowEndTick } }
            : {}),
          ...(a.ownerId !== undefined && a.skillCd
            ? { skillCd: a.skillCd.slice() }
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

    spawnGroundLoot(seatId: number, loot: LootState) {
      // 在指定 seat 玩家脚下生成地面掉落（背包满溢出回落，C-Per-3）。
      const p = actors.find((x) => x.ownerId === seatId);
      const pos = p ? { x: p.x, y: p.y } : { x: RESPAWN_POS.x, y: RESPAWN_POS.y };
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
