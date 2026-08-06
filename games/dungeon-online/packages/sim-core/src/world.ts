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
  CLASS_BASE,
  ENEMY_PROTOTYPES,
  InputAction,
  type EntityState,
  type WorldSnapshot,
  type InputCmd,
  type PlayerClass,
  type RoomPhaseValue,
  type EntityKindValue,
  type PersonalState,
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
  // ── E7 倒地/救援/超时/托管状态（仅 world.step 维护；纪律 B）──
  rescueTicks: number; // 倒地后累积的救援读条 tick（S7.2）
  downedTicks: number; // 倒地后经过的 tick（S7.5 超时判定）
  disconnected: boolean; // 断线托管标记（S7.6）：跳过 tick + 暂停计时
  /** 断线瞬间抓拍的冻结态（D8 / P4 保底），单次持有，重连前不被覆盖。 */
  personalState?: PersonalState | null;
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

export function createWorld(opts: CreateWorldOpts): World {
  const layout: LayoutSnapshot = generateLayout(opts.seed, opts.biomeId);
  const actors: Actor[] = [];
  let nextId = 0;

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
      });
  }

  // 敌人：从 E3 SpawnPoint[] 实例生成（只读），用确定性 Rng 做位置抖动/血量。
  const erng = new Rng(hashString64(`${opts.seed}:${opts.biomeId}:enemies`));
  for (const sp of layout.spawnPoints) {
    const proto = ENEMY_PROTOTYPES[sp.enemyTypeId];
    for (let i = 0; i < sp.count; i += 1) {
      const hp = erng.nextInt(proto.hpMin, proto.hpMax);
      const kind =
        proto.tier === "boss" ? EntityKind.BOSS : EntityKind.ENEMY;
      actors.push({
        id: nextId++,
        kind,
        x: sp.pos.x + erng.nextInt(-32, 32),
        y: sp.pos.y + erng.nextInt(-32, 32),
        dir: erng.nextInt(0, 7),
        hp,
        maxHp: hp,
        status: EntityStatus.ALIVE,
        enemyTypeId: sp.enemyTypeId,
        rescueTicks: 0,
        downedTicks: 0,
        disconnected: false,
        personalState: null,
      });
    }
  }

  const inputs = new PerPlayerInputQueue();
  for (const p of opts.players) inputs.register(p.seatId);

  const world: World = {
    runId: opts.runId,
    seed: opts.seed,
    biomeId: opts.biomeId,
    tick: 0,
    roomPhase: RoomPhase.ACTIVE,
    actors: () => actors.slice(),
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
          } else if (cmd.action === InputAction.ATTACK || cmd.action === InputAction.SKILL) {
            // 战斗意图：启动前摇（D12）。若已有进行中前摇则忽略（防覆盖/刷新）。
            if (!a.telegraph) {
              a.telegraph = {
                startTick: world.tick,
                applyTick: world.tick + MIN_TELEGRAPH_TICKS,
                targetId: cmd.target ?? a.id,
                kind: cmd.action,
              };
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
            .map((t) => ({ id: t.id, x: t.x, y: t.y, alive: true }));
          const intent = stepEnemyAi(self, { tick: world.tick, players });
          if (intent.type === "MOVE") {
            // 敌人移速按 ENEMY_PROTOTYPES.speed / 30（每 tick 位移，平衡初稿）。
            const proto = ENEMY_PROTOTYPES[a.enemyTypeId!];
            const ms = proto.speed / 30;
            a.x += intent.dir.x * ms;
            a.y += intent.dir.y * ms;
          } else if (intent.type === "ATTACK") {
            // 攻击前摇：tier 分层 telegraphTicks（≥18，D12）；已有前摇则忽略（防覆盖/刷新）。
            if (!a.telegraph) {
              const proto = ENEMY_PROTOTYPES[a.enemyTypeId!];
              a.telegraph = {
                startTick: world.tick,
                applyTick: world.tick + proto.telegraphTicks,
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
          }
          a.telegraph = null; // 一次性结算后清除前摇
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

      world.tick += 1;
    },
    snapshot(): WorldSnapshot {
      const entities: EntityState[] = actors.map((a) => ({
        id: a.id,
        kind: a.kind,
        pos: { x: a.x, y: a.y },
        dir: a.dir,
        hp: a.hp,
        maxHp: a.maxHp,
        status: a.status,
        statusEffects: [],
        ownerId: a.ownerId,
        // S7.2 救援读条：仅倒地「玩家」附带（敌人倒地不进救援系统；undefined 不影响确定性快照哈希）。
        rescue:
          a.kind === EntityKind.PLAYER && (a.status & EntityStatus.DOWNED) !== 0
            ? { targetId: a.id, progressTicks: a.rescueTicks, totalTicks: RESCUE_TICKS }
            : undefined,
      }));
      return {
        tick: world.tick,
        runId: world.runId,
        roomPhase: world.roomPhase,
        entities,
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
