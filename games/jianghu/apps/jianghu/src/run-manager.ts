/**
 * run-manager.ts — 房间 ↔ 世界 ↔ run 循环编排（E1.S1.3 / C5 / C6 / E5 副本生命周期）
 * ===========================================================================
 * ① 编排层：每个 room（RESIDENT 主世界 / 副本 instance）持有一个 World + 一个 12Hz run 循环。
 * run 循环的 onBroadcast 仅把二进制快照下发到「本 room 的广播域」（connection-registry
 * 按 roomId 路由，保证 C-Net-1 双向零泄漏）。
 *
 * E5（ADR-JH-ENG-03）新增实例生命周期：
 *   - enterInstance：RESIDENT tick → seed=computeInstanceSeed(serverTick,entranceId,partyTag)
 *     → buildDungeonSpec（BOSS 置最深层，C-Dgn-3）→ 建 instance room（成员锁定，C-Dgn-2）
 *     → 建独立 world（spawnZones）+ startRun → 成员实体切域（出主世界/入副本）。
 *   - exitInstance：停 instance run、成员回 RESIDENT 安全区（出本归位）、instance room 销毁。
 *   - checkInstanceExpiry：副本寿命 expireAt=30min（C-Dgn-4）到点自动解散。
 *
 * 纪律 A/B（C6）：本文件是 sim-core 的唯一编排点；不反向被 sim-core import。
 */

import { createWorld, type World, type PlayerSeat } from "../sim-core/src/world.ts";
import { RoomPhase, EntityKind, type WorldSnapshot, type InputCmd, type Vec2 } from "../sim-core/src/types.ts";
import {
  TILE,
  RESPAWN_POS,
  DUNGEON_EXPIRE_MS,
  INVENTORY_CAP, // E6：背包数据通道 cap（C7 单一来源）
  PARTY_GATHER_WINDOW_TICKS, // E13：入口集合窗口（tick）= 5s @12Hz
  PARTY_MAX_MEMBERS, // E13：同本成员上限（MVP）= 4
  ENTRANCE_INTERACT_RADIUS, // E16：进本交互半径（px）= 1.5×TILE（C7）
} from "../sim-core/src/constants.ts"; // C7 单一来源
import type { SpawnZone } from "../sim-core/src/spawning.ts";
import { computeInstanceSeed, buildDungeonSpec } from "../sim-core/src/dungeonGen.ts"; // C7/D9/C-Dgn-1
import { startRunLoop, type RunLoopHandle } from "./run-runtime.ts";
import { encodeSnapshot } from "./protocol-binary.ts";
import {
  broadcastData,
  setRoom,
  activeUserConn,
  sendToConn, // E6：背包数据通道（控制面推送）
} from "./connection-registry.ts";
import {
  getRoom,
  createInstanceRoom,
  destroyRoom,
  leaveRoom, // E13：等待中单成员取消出本
  addInstanceMember, // E13：等待窗口内向实例追加成员（编排层专用）
  RESIDENT_ROOM_ID,
} from "./room-service.ts";
import type { CharacterService, InventoryItem, Inventory, CharacterSnapshot } from "./persistence.ts";
import { addItem, toGroundLoot } from "./inventory.ts";
import type { LootResult } from "../sim-core/src/loot.ts";
import { itemProto, type EquippedSlots } from "../sim-core/src/affixes.ts"; // E7：slot 推导 + 装备槽
import { generateId } from "./ids.ts";

// ─────────────────────────────────────────────────────────────
// F1（P1）拾取→背包生产接线（C-Per-3 闭环）
// ─────────────────────────────────────────────────────────────
// 模块级角色服务引用（参照 gateway.activeCharacterService 模式）：server.ts / gateway 启动时注入，
// run-manager 不反向 import gateway（C6 纪律 B，避免循环依赖）。onPickup 在 tick 时才读该引用，
// 因此「先起 run、后注入」也安全（run 循环为异步，注入发生在首个拾取之前）。
let activeCharacterService: CharacterService | null = null;

/** 注入角色服务（server.ts 启动时调用；测试可注入独立实例隔离状态）。 */
export function setActiveCharacterService(cs: CharacterService): void {
  activeCharacterService = cs;
}

/**
 * 会话快照同步器（gateway 注入）：拾取/升级落库后同步 liveSessions 里该 seat 的
 * session.snapshot，否则 30s autosave / 下线 save 会用旧快照覆盖文件 → 拾取/升级丢失（P0 修复）。
 */
let seatSnapshotSyncer: ((seatId: number, snap: CharacterSnapshot) => void) | null = null;

export function setSeatSnapshotSyncer(fn: ((seatId: number, snap: CharacterSnapshot) => void) | null): void {
  seatSnapshotSyncer = fn;
}

/**
 * 默认拾取接线：把一次拾取应用到「登录玩家」背包（C-Per-3 闭环）。
 *
 * seatId → 登录/游客解析方式（本实现选定）：
 *   - 经 `activeCharacterService.getSeatInfo(seatId)`（CharacterService.begin 时登记的
 *     seatId → {userId, guest}）解析。CharacterService 本就是 seat/player 映射的唯一权威
 *     （assignSeat 分配座位、begin 双模式 choke point），guest 标志在此登记，最贴合现有架构。
 *   - 未注入服务 / 座位未登记（未知 seatId）→ 直接忽略：仅维持 sim 地面掉落生命周期；
 *   - 游客 → 直接忽略（C-Per-1 零持久写：绝不 loadOrCreate 游客，否则会为游客建角色落库）；
 *   - 登录 → `void applyPickupToInventory`（async 落库，.catch 吞错，不阻塞 12Hz 循环）。
 */
function handlePickup(roomId: string, seatId: number, loot: LootResult): void {
  const cs = activeCharacterService;
  if (!cs) return; // 未注入服务（冷启动 / 未接线场景）→ 仅维持 sim 地面掉落生命周期
  const info = cs.getSeatInfo(seatId);
  if (!info || info.guest) return; // 游客 / 未知座位 → 零持久写（C-Per-1）
  const world = getWorld(roomId);
  if (!world) return;
  void applyPickupToInventory(cs, info.userId, world, loot).catch(() => {});
}

export interface StartRunOpts {
  readonly runId: string;
  readonly roomId: string;
  readonly seed: string;
  readonly phase: WorldSnapshot["phase"];
  readonly players?: readonly PlayerSeat[];
  readonly lootTokens?: number;
  /** E4/E5 刷怪区（副本 instance 用；RESIDENT 不传 → 无刷怪，保持既有 golden）。 */
  readonly spawnZones?: readonly SpawnZone[];
  /** 世界尺寸（px），缺省 40*TILE × 30*TILE（与 createWorld 默认一致）。 */
  readonly bounds?: { readonly w: number; readonly h: number };
  /**
   * E15：玩家死亡复活点（px）。缺省 RESPAWN_POS（主世界不变）；副本 instance 由
   * enterInstance 传 spec.entryTile（进本落点一致，防复活卡墙/出副本坐标）。
   */
  readonly respawnPos?: Vec2;
  /**
   * 拾取回调（可选）。每次玩家拾取地面掉落时触发（seatId + 掉落）。
   * **默认已接**（F1）：bootResidentRun / enterInstance 传 `handlePickup` —— seatId → 登录/游客解析，
   * 登录玩家经 applyPickupToInventory 落背包，游客直接忽略（C-Per-1 零持久写）。
   * 调用方可用自定义回调覆盖（如测试注入）；不传则仅维持 sim-core 地面掉落生命周期（掉落→ttl→拾取移除），不落背包。
   */
  readonly onPickup?: (seatId: number, loot: LootResult) => void;
  /**
   * E9：升级回调（可选）。每次玩家升级时触发（seatId + level/xp/xpNext）。
   * **默认已接**：bootResidentRun / enterInstance 传 `handleLevelUp` —— 登录落库（Character.level/exp）+
   * 推送 character.level；游客直接忽略（C-Per-1 零持久写 + 不推送）。
   * 调用方可用自定义回调覆盖（如测试注入）；不传则仅维持 world 内升级（actor attrs 更新），不落库/不推送。
   */
  readonly onLevelUp?: (seatId: number, level: number, xp: number, xpNext: number) => void;
  /**
   * E19：强化石获得回调（可选）。每次精英/BOSS 击杀触发（seatId + 本次获得石数）。
   * **默认已接**：bootResidentRun / enterInstance 传 `handleMaterialGain` —— 登录落库
   * （Character.materials）+ 推送 character.inventory（materials 字段）；游客直接忽略（C-Per-1）。
   * 调用方可用自定义回调覆盖（如测试注入）；不传则仅维持 world 内计数（actor.materials），不落库/不推送。
   */
  readonly onMaterialGain?: (seatId: number, stones: number) => void;
  /**
   * E20：宝箱开箱回调（可选）。每次 BOSS 宝箱开箱触发（seatId + 3-5 件物品 + 强化石×2）。
   * **默认已接**：bootResidentRun / enterInstance 传 `handleChestOpen` —— 登录批量入库
   * （addItem 循环 + 溢出落地面 C-Per-3）+ 材料累加（E19 Character.materials）+ 推送
   * character.inventory（items + materials 一次拉全）；游客直接忽略（C-Per-1）。
   * 调用方可用自定义回调覆盖（如测试注入）；不传则仅维持 world 内事件缓冲（consumeChestOpens 取走），不落库/不推送。
   */
  readonly onChestOpen?: (seatId: number, items: LootResult[], stones: number) => void;
}

interface RunEntry {
  readonly handle: RunLoopHandle;
  readonly world: World;
}

/** 副本 instance 成员（进入瞬间锁定，C-Dgn-2）。 */
export interface InstanceMember {
  readonly seatId: number;
  readonly userId: string;
}

/** 副本 instance 运行时元信息（寿命 / seed / 成员）。seed 仅服务端持有（C-Dgn-1）。 */
interface InstanceMeta {
  readonly entranceId: number;
  readonly biomeId: number;
  readonly seed: string;
  readonly members: readonly InstanceMember[];
  /** 副本寿命（wall-clock ms，30min；C-Dgn-4）。 */
  readonly expireAt: number;
}

const runs = new Map<string, RunEntry>();
const instances = new Map<string, InstanceMeta>();

/**
 * E13：入口集合缓冲（多人同本）—— 等待窗口内的实例。
 *
 * 生命周期：`enterInstance` 创建 → 进入 `waitingInstances`（**可加入**）→
 * 窗口到期（lockTick）/ 满员（PARTY_MAX_MEMBERS）→ `lockWaitingInstance` 冻结成员
 * 移入正式 `instances` 表（C-Dgn-2）→ 寿命到点解散（C-Dgn-4）。
 *
 * 关键语义（主理人拍板 + playtest golden 兼容的工程裁定）：
 *   - 实例房间**自创建即 locked=true**（room-service 既有语义 / playtest `instRoom.locked`
 *     断言）；「等待中未锁定可加入」由本 waiting 状态表达 —— run-manager 编排层在窗口内
 *     经 `addInstanceMember` 显式追加成员（外部 joinInstance 仍被 locked 拒绝，C-Dgn-2 守门不变）；
 *   - 单人秒开：窗口内无人加入即单人锁定开本，不强制组队；
 *   - **窗口用 RESIDENT world tick 计时（D9 确定性，不用 Date.now）**；寿命仍 wall-clock（C-Dgn-4）。
 */
interface WaitingInstance {
  readonly entranceId: number;
  readonly instanceRoomId: string;
  /** 等待窗口内可变成员（可追加/取消）；锁定瞬间冻结快照进入 InstanceMeta。 */
  readonly members: InstanceMember[];
  readonly seed: string;
  readonly biomeId: number;
  /** 副本入口出生点（dungeonGen spec.entryTile；创建者与加入者统一落点，防进本卡墙）。 */
  readonly entryTile: Vec2;
  /** RESIDENT world tick 达此值即锁定开本（= 创建时 world.tick + PARTY_GATHER_WINDOW_TICKS）。 */
  readonly lockTick: number;
  /** 寿命（wall-clock ms；等待中超时未锁 → 解散，C-Dgn-4）。 */
  readonly expireAt: number;
}

/** entranceId → waiting 实例（每入口至多一个 waiting；锁定后移入 instances）。 */
const waitingInstances = new Map<number, WaitingInstance>();

/**
 * E7：seatId → 已穿戴装备（世界面向缓存）。
 * - 持久化（Character.equipped）为耐用权威；本 Map 是「世界镜像」同步缓存：
 *   装备变更（protocol resolveEquip/Unequip）与 addPlayerToRoom（room.join）时写入，
 *   enterInstance / exitInstance 换域 addPlayer 时读取（避免异步 loadOrCreate 塞进同步路径）。
 * - 同一进程内与持久化保持一致（equip 请求同时落库 + 写 Map）；服务重启后由
 *   gateway room.join 经 snapshot.character.equipped 重新播种。
 */
const equipBySeat = new Map<number, EquippedSlots>();

/**
 * E9：seatId → 等级（世界面向缓存，镜像 equipBySeat）。
 * - 持久化（Character.level）为耐用权威；本 Map 是「世界镜像」同步缓存：
 *   升级事件（handleLevelUp）与 room.join 播种时写入，enterInstance / exitInstance 换域
 *   addPlayer 时读取（避免异步 loadOrCreate 塞进同步路径）。
 * - 同一进程内与持久化保持一致（升级同时落库 + 写 Map）；服务重启后由 gateway
 *   room.join 经 snapshot.character.level 重新播种。
 */
const levelBySeat = new Map<number, number>();

/**
 * E19：seatId → 强化石数（世界面向缓存，镜像 equipBySeat / levelBySeat）。
 * - 持久化（Character.materials）为耐用权威；本 Map 是「世界镜像」同步缓存：
 *   击杀事件（handleMaterialGain）与 room.join 播种时写入，enterInstance / exitInstance
 *   换域 addPlayer 时读取（避免异步 loadOrCreate 塞进同步路径）。
 * - 同一进程内与持久化保持一致（击杀同时落库 + 写 Map）；服务重启后由 gateway
 *   room.join 经 snapshot.character.materials 重新播种。
 */
const materialBySeat = new Map<number, number>();

// C-Dgn-4：副本寿命巡检（5s；unref 不阻塞进程退出）。测试经 checkInstanceExpiry(now) 直接驱动。
const expireTimer = setInterval(() => {
  checkInstanceExpiry();
}, 5000);
expireTimer.unref?.();

/** 启动某 room 的权威 run（创建 stub world + 12Hz 循环 + 本域二进制广播）。 */
export function startRun(opts: StartRunOpts): WorldSnapshot {
  // 若已存在，先停旧（防御：避免重复循环）。
  if (runs.has(opts.roomId)) stopRun(opts.roomId);

  const world = createWorld({
    runId: opts.runId,
    roomId: opts.roomId,
    seed: opts.seed,
    phase: opts.phase,
    players: opts.players,
    lootTokens: opts.lootTokens,
    spawnZones: opts.spawnZones, // E5：副本刷怪区
    bounds: opts.bounds, // E5：实例世界尺寸
    respawnPos: opts.respawnPos, // E15：副本复活点（缺省 RESPAWN_POS）
  });

  const handle = startRunLoop({
    onTick(_tick, _inputs) {
      world.step();
      // E13：每 tick sweep 等待窗口（窗口到期/满员 → 锁定开本；D9 tick 计时，非 Date.now）。
      //     startRun 的 onTick 为 RESIDENT 与 instance run 共用；sweep 幂等且按 RESIDENT
      //     world tick 判定（instance loop 触发时同样正确，仅为同一判定的旁路）。
      //     enterInstance 亦惰性 sweep 兜底（进入路径即时生效）。
      sweepWaitingInstances();
      // E4/F1：取走本 tick 拾取事件，转发给服务端 onPickup 钩子（默认 handlePickup：登录入库、游客忽略，C-Per-1）。
      for (const p of world.consumePickups()) {
        opts.onPickup?.(p.seatId, p.loot);
      }
      // E9：取走本 tick 升级事件，转发给服务端 onLevelUp 钩子（默认 handleLevelUp：登录落库 + 推送 character.level，游客忽略 C-Per-1）。
      for (const ev of world.consumeLevelUps()) {
        opts.onLevelUp?.(ev.seatId, ev.level, ev.xp, ev.xpNext);
      }
      // E19：取走本 tick 强化石获得事件，转发给服务端 onMaterialGain 钩子
      //   （默认 handleMaterialGain：登录落库 Character.materials + 推送 inventory.materials，游客忽略 C-Per-1）。
      for (const ev of world.consumeMaterialGains()) {
        opts.onMaterialGain?.(ev.seatId, ev.stones);
      }
      // E20：取走本 tick 宝箱开箱事件，转发给服务端 onChestOpen 钩子
      //   （默认 handleChestOpen：登录批量入库 + 材料累加 + 推送 inventory，游客忽略 C-Per-1）。
      for (const ev of world.consumeChestOpens()) {
        opts.onChestOpen?.(ev.seatId, ev.items, ev.stones);
      }
    },
    onSnapshot() {
      return world.snapshot();
    },
    onBroadcast(snapshot: WorldSnapshot) {
      // C5 / C-Net-1：仅广播到本 room 域（connection-registry 按 roomId 过滤）。
      const buf = encodeSnapshot(snapshot);
      broadcastData(snapshot.roomId, buf);
    },
  });

  runs.set(opts.roomId, { handle, world });
  return world.snapshot();
}

/** 入队一条玩家输入（经网关路由，带 playerId）。C11 seq 单调由 world.enqueueInput 强制。 */
export function enqueueInput(roomId: string, _playerId: number, cmd: InputCmd): void {
  const entry = runs.get(roomId);
  if (!entry) return;
  entry.handle.enqueueInput(cmd);
  // world 自建 seatId→pending，run loop 的扁平队列（onTick 当前忽略）仅作旁路收集。
  entry.world.enqueueInput(_playerId, cmd);
}

/** 在权威世界 spawn 一个玩家实体（E3：玩家成功加入房间后调用）。room 未运行则静默忽略。 */
export function addPlayerToRoom(roomId: string, seatId: number, userId: string, equipped?: EquippedSlots, level?: number, materials?: number): void {
  const entry = runs.get(roomId);
  if (!entry) return;
  // E7：room.join 播种装备（持久化镜像 → 世界）。游客/未装备 → undefined → 基础属性。
  if (equipped !== undefined) equipBySeat.set(seatId, equipped);
  // E9：room.join 播种等级（持久化镜像 → 世界；游客/缺省 → undefined → L1 基础属性）。
  if (level !== undefined) levelBySeat.set(seatId, level);
  // E19：room.join 播种强化石（持久化镜像 → 世界；游客/缺省 → undefined → 0）。
  if (materials !== undefined) materialBySeat.set(seatId, materials);
  entry.world.addPlayer(seatId, userId, undefined, equipBySeat.get(seatId), levelBySeat.get(seatId), materialBySeat.get(seatId));
}

/**
 * E16：座位断线 → 清该 seat 的输入续行状态（world.clearPlayerInput）。
 * gateway 在 ws.on('close') / ping 超时路径调用（主世界 + 副本实例都清；C6：gateway→run-manager→world）。
 * 效果：断线角色立即停（step 不再续行），不动 actor 坐标/hp；重连后（room.join 幂等 + 输入恢复）可继续。
 */
export function onSeatDisconnect(roomId: string, seatId: number): void {
  getWorld(roomId)?.clearPlayerInput(seatId);
}

/**
 * E16：入口服务端坐标校验 —— 玩家当前主世界（RESIDENT）位置与 ENTRANCE 距离 ≤ ENTRANCE_INTERACT_RADIUS。
 * 在 protocol dungeon.enter 调 enterInstance **之前**校验（C6：protocol → run-manager → world 读权威状态）。
 * 仅创建路径走本闸门；dungeon.exit（出本）任意位置可出（需求明确，不做坐标校验）。
 * @returns { ok: true } 通过；{ ok: false, reason } 拒绝（NOT_AT_ENTRANCE / 玩家不在主世界 / RESIDENT 未跑）。
 */
export function canEnterInstance(seatId: number): { ok: boolean; reason?: string } {
  const resident = runs.get(RESIDENT_ROOM_ID);
  if (!resident) return { ok: false, reason: "RESIDENT_NOT_RUNNING" };
  const player = resident.world.actors().find((a) => a.ownerId === seatId);
  if (!player) return { ok: false, reason: "NOT_IN_RESIDENT" };
  const entrance = resident.world.actors().find((a) => a.kind === EntityKind.ENTRANCE);
  if (!entrance) return { ok: false, reason: "NO_ENTRANCE" };
  if (Math.hypot(player.x - entrance.x, player.y - entrance.y) <= ENTRANCE_INTERACT_RADIUS) {
    return { ok: true };
  }
  return { ok: false, reason: "NOT_AT_ENTRANCE" };
}

/**
 * E7：应用装备到世界 actor（equip/unequip 请求后由 protocol 调用）。
 * - 更新 equipBySeat 缓存（供换域 addPlayer 时重新应用）；
 * - roomId 存在 → 同步更新该房间世界 actor（maxHp/attrs 重算，combat 即时生效）。
 * - roomId 为空（未加入房间）→ 仅缓存，等下次 addPlayer 应用。
 */
export function setPlayerEquipped(roomId: string | null | undefined, seatId: number, equipped: EquippedSlots): void {
  equipBySeat.set(seatId, equipped);
  if (roomId) {
    const entry = runs.get(roomId);
    entry?.world.setPlayerEquipped(seatId, equipped);
  }
}

/** 取某 room 权威 World（测试 / 编排用；room 未运行返回 null）。 */
export function getWorld(roomId: string): World | null {
  return runs.get(roomId)?.world ?? null;
}

export function getSnapshot(roomId: string): WorldSnapshot | null {
  const entry = runs.get(roomId);
  return entry ? entry.world.snapshot() : null;
}

export function isRunning(roomId: string): boolean {
  return runs.has(roomId);
}

/** 是否活跃副本 instance（E5：dungeon.exit 校验用；E13：含等待窗口内的实例）。 */
export function isInstanceRunning(roomId: string): boolean {
  if (instances.has(roomId)) return true;
  for (const w of waitingInstances.values()) {
    if (w.instanceRoomId === roomId) return true;
  }
  return false;
}

/**
 * E13：是否等待（集合缓冲）中的实例 —— 窗口内可加入；锁定后 false。
 * 供测试 / 协议校验区分「waiting 可加入」与「locked 已冻结」（C-Dgn-2）。
 */
export function isInstanceWaiting(roomId: string): boolean {
  for (const w of waitingInstances.values()) {
    if (w.instanceRoomId === roomId) return true;
  }
  return false;
}

/**
 * E13：锁定一个 waiting 实例 —— 从 waitingInstances 移入正式 instances 表，成员冻结（C-Dgn-2）。
 * @returns 锁定的 instanceRoomId；非 waiting → null。
 */
function lockWaitingInstance(entranceId: number): string | null {
  const w = waitingInstances.get(entranceId);
  if (!w) return null;
  waitingInstances.delete(entranceId);
  const frozenMembers: readonly InstanceMember[] = [...w.members]; // 冻结快照（C-Dgn-2：锁定后不可变）
  instances.set(w.instanceRoomId, {
    entranceId: w.entranceId,
    biomeId: w.biomeId,
    seed: w.seed,
    members: frozenMembers,
    expireAt: w.expireAt,
  });
  return w.instanceRoomId;
}

/**
 * E13：sweep 全部 waiting 实例 —— 窗口到期（tick ≥ lockTick）或满员（≥ PARTY_MAX_MEMBERS）
 * → 立即锁定开本。由 enterInstance 惰性调用 + RESIDENT run 循环每 tick 调用 +
 * checkInstanceExpiry 调用（生产：窗口到期 ≈ 5s 内自动开本；测试注入确定 nowTick 驱动）。
 * @param nowTick  RESIDENT world tick（缺省取当前；D9 确定性，测试可注入）。
 * @returns 本次锁定的 instanceRoomIds。
 */
export function sweepWaitingInstances(nowTick?: number): string[] {
  const resident = runs.get(RESIDENT_ROOM_ID);
  const tick = nowTick ?? resident?.world.tick ?? 0;
  const locked: string[] = [];
  for (const [entranceId, w] of [...waitingInstances.entries()]) {
    if (w.members.length >= PARTY_MAX_MEMBERS || tick >= w.lockTick) {
      const roomId = lockWaitingInstance(entranceId);
      if (roomId) locked.push(roomId);
    }
  }
  return locked;
}

export function stopRun(roomId: string): void {
  const entry = runs.get(roomId);
  if (entry) {
    entry.handle.stop();
    runs.delete(roomId);
  }
}

/** 启动 RESIDENT 主世界 run（server 启动时调用一次，C5 常驻）。 */
export function bootResidentRun(seed = "jianghu-overworld-0"): WorldSnapshot {
  const room = getRoom(RESIDENT_ROOM_ID);
  const roomId = room?.roomId ?? RESIDENT_ROOM_ID;
  // E7.1：主世界刷怪区（普通 passive 站桩 + 精英 aggressive 巡逻；围绕出生点四周，出生点/入口保持安全距离）。
  // E7.2：精英移到远角 (36,4)，出生点 (16,15) 附近全是 passive 普通怪（新手/E2E farmLoot 不会被精英反杀）。
  const overworldZones: SpawnZone[] = [
    { pos: { x: 8 * TILE, y: 8 * TILE }, tier: 0, enemyTypeId: "savage", count: 3, respawnTicks: 600, aggression: "passive" },
    { pos: { x: 28 * TILE, y: 8 * TILE }, tier: 0, enemyTypeId: "brigand", count: 2, respawnTicks: 600, aggression: "passive" },
    { pos: { x: 14 * TILE, y: 22 * TILE }, tier: 0, enemyTypeId: "brigand", count: 2, respawnTicks: 600, aggression: "passive" },
    { pos: { x: 26 * TILE, y: 22 * TILE }, tier: 0, enemyTypeId: "brigand", count: 2, respawnTicks: 600, aggression: "passive" },
    { pos: { x: 36 * TILE, y: 4 * TILE }, tier: 1, enemyTypeId: "shadow", count: 1, respawnTicks: 900, aggression: "aggressive" },
  ];
  return startRun({
    runId: "run_resident",
    roomId,
    seed,
    phase: RoomPhase.OVERWORLD,
    lootTokens: 4,
    spawnZones: overworldZones, // E7.1 主世界刷怪区（持续掉落来源）
    // F1（P1）：拾取→背包接线（登录入库、游客忽略 C-Per-1）。
    onPickup: (seatId, loot) => handlePickup(roomId, seatId, loot),
    // E9：升级→落库 + 推送 character.level（登录；游客忽略 C-Per-1）。
    onLevelUp: (seatId, level, xp, xpNext) => handleLevelUp(roomId, seatId, level, xp, xpNext),
    // E19：强化石→落库 + 推送 inventory.materials（登录；游客忽略 C-Per-1）。
    onMaterialGain: (seatId, stones) => handleMaterialGain(seatId, stones),
    // E20：宝箱开箱→批量入库 + 材料累加 + 推送 inventory（登录；游客忽略 C-Per-1）。
    onChestOpen: (seatId, items, stones) => handleChestOpen(roomId, seatId, items, stones),
  });
}

export interface EnterInstanceOpts {
  readonly biomeId?: number;
  /** 副本寿命（ms），缺省 DUNGEON_EXPIRE_MS=30min（C-Dgn-4）。测试可注入短寿命。 */
  readonly lifetimeMs?: number;
}

/**
 * E5/E13：进入副本实例（「进入或加入」；ADR-JH-ENG-03 §3 + E13 入口集合缓冲）。
 *
 * 流程（E13 多人同本）：
 *   1) 该入口存在 waiting（集合窗口内）实例 → **加入**：成员追加 + 副本 world 加玩家实体 +
 *      域切换（C-Net-1/2；连接订阅由 protocol/gateway setRoom 原子切）；满员（PARTY_MAX_MEMBERS）
 *      → 立即锁定开本；返回 `{ joined: true }`。
 *   2) 否则 → **创建**新 waiting 实例：seed（服务端权威，C-Dgn-1）→ 布局 → instance room
 *      （自创建即锁定，C-Dgn-2）→ 独立 world + 12Hz run（独立广播域，C-Net-1）→ 首个成员入本 →
 *      记 lockTick = RESIDENT world.tick + PARTY_GATHER_WINDOW_TICKS（**D9：窗口用 tick 计时，
 *      非 Date.now**）；返回 `{ joined: false }`。
 *
 * 判定顺序（创建路径）：
 *   - 同入口已有**锁定**实例 → `INSTANCE_LOCKED`（C-Dgn-2：锁定后不可再加入）；
 *   - 入口冷却（C-Dgn-4：10s 防刷本）→ `ENTRANCE_COOLDOWN`。**仅创建路径**校验冷却：
 *     不同玩家加入 waiting 实例不受任何玩家上次冷却影响（E13）。
 *
 * 纪律：seed 仅服务端计算持有，**不返回给客户端路径**（C-Dgn-1）；成员锁定后冻结（C-Dgn-2）。
 */
export function enterInstance(
  entranceId: number,
  members: readonly InstanceMember[],
  opts: EnterInstanceOpts = {},
): { ok: boolean; reason?: string; instanceRoomId?: string; joined?: boolean } {
  const resident = runs.get(RESIDENT_ROOM_ID);
  if (!resident) return { ok: false, reason: "RESIDENT_NOT_RUNNING" };

  // E13：惰性检查 —— 先锁定已到窗口/满员的 waiting 实例（生产由 RESIDENT run 每 tick sweep；
  // 此处保证 enter 路径即时看到最新状态，如「A 满员 → B 再进 → INSTANCE_LOCKED」）。
  sweepWaitingInstances();

  // ① 该入口存在 waiting（未锁定）实例 → 加入（E13 多人同本核心）。
  const waiting = waitingInstances.get(entranceId);
  if (waiting) {
    if (members.length !== 1) {
      return { ok: false, reason: "JOIN_SINGLE_ONLY", instanceRoomId: waiting.instanceRoomId };
    }
    const m = members[0];
    // 防御：seatId / userId 已在实例内（重复加入）→ 拒绝。
    if (waiting.members.some((x) => x.seatId === m.seatId || x.userId === m.userId)) {
      return { ok: false, reason: "ALREADY_MEMBER", instanceRoomId: waiting.instanceRoomId };
    }
    // 追加成员：waiting 列表 + room.members（编排层显式操作；外部 joinInstance 仍被 locked 拒，C-Dgn-2）。
    waiting.members.push(m);
    addInstanceMember(waiting.instanceRoomId, m.userId);
    // 域切换（C-Net-1/2）：出主世界 + 进副本世界（连接订阅由 protocol/gateway setRoom 原子切）。
    resident.world.removePlayer(m.seatId);
    getWorld(waiting.instanceRoomId)?.addPlayer(m.seatId, m.userId, waiting.entryTile, equipBySeat.get(m.seatId), levelBySeat.get(m.seatId), materialBySeat.get(m.seatId));
    // 满员 → 立即锁定开本。
    if (waiting.members.length >= PARTY_MAX_MEMBERS) sweepWaitingInstances();
    return { ok: true, joined: true, instanceRoomId: waiting.instanceRoomId };
  }

  // ② 创建路径。
  // 2a. 同入口已有锁定实例 → 拒绝（INSTANCE_LOCKED / C-Dgn-2：锁定后不可再加入）。
  for (const meta of instances.values()) {
    if (meta.entranceId === entranceId) return { ok: false, reason: "INSTANCE_LOCKED" };
  }
  // 2b. 入口冷却（C-Dgn-4：10s 防刷本；服务端权威闸门）。用 RESIDENT world tick（与 E13 窗口
  //     同源，测试可确定性推进）；join 路径不走本闸门（E13：加入 waiting 不受上次冷却影响）。
  if (!resident.world.tryEnterEntrance(resident.world.tick)) {
    return { ok: false, reason: "ENTRANCE_COOLDOWN" };
  }
  if (members.length === 0) return { ok: false, reason: "NO_MEMBERS" };

  // 2c. seed = hash(loopTick + entranceId + partyTag)；partyTag=首个触发者（C-Dgn-1 / dungeon §⑥）。
  //     **loopTick（resident.handle.getTick）**：playtest golden 在同步切片下 loopTick=0 断言
  //     seed=computeInstanceSeed(0,...)，保持此语义（world.tick 供冷却/窗口计时，二者解耦）。
  const serverTick = resident.handle.getTick();
  const partyTag = members[0].userId;
  const seed = computeInstanceSeed(serverTick, entranceId, partyTag).toString();
  const biomeId = opts.biomeId ?? 0;

  // 2d. 确定性布局 + 副本规格（BOSS 置最深层，C-Dgn-3；刷怪密度 ×1.2，DUNGEON_SPAWN_DENSITY）。
  const spec = buildDungeonSpec(seed, biomeId);

  // 2e. 建 instance 房间（自创建即锁定，C-Dgn-2）+ 独立 world + 12Hz run（独立广播域，C-Net-1）。
  const room = createInstanceRoom(members.map((m) => m.userId));
  const instanceRoomId = room.roomId;
  startRun({
    runId: generateId("run"),
    roomId: instanceRoomId,
    seed,
    phase: RoomPhase.DUNGEON,
    spawnZones: spec.spawnZones,
    bounds: { w: GRID_W_PX, h: GRID_H_PX },
    lootTokens: 0, // 副本无占位漂浮 token（掉落仅来自敌人，C-Net-1 域干净）
    // E15：副本死亡复活点 = 进本出生点（entryTile，与进本落点一致，防复活卡墙/出副本坐标）。
    respawnPos: spec.entryTile,
    // F1（P1）：副本拾取同样落背包（登录入库、游客忽略 C-Per-1）。
    onPickup: (seatId, loot) => handlePickup(instanceRoomId, seatId, loot),
    // E9：副本升级同样落库 + 推送（登录；游客忽略 C-Per-1）。
    onLevelUp: (seatId, level, xp, xpNext) => handleLevelUp(instanceRoomId, seatId, level, xp, xpNext),
    // E19：副本精英/BOSS 击杀同样落库 + 推送 inventory.materials（登录；游客忽略 C-Per-1）。
    onMaterialGain: (seatId, stones) => handleMaterialGain(seatId, stones),
    // E20：副本 BOSS 宝箱开箱同样批量入库 + 材料累加 + 推送 inventory（登录；游客忽略 C-Per-1）。
    onChestOpen: (seatId, items, stones) => handleChestOpen(instanceRoomId, seatId, items, stones),
  });

  // 2f. 成员实体：出 RESIDENT 世界 + 进 instance 世界（域切换；C-Net-1 不混流大图）。
  for (const m of members) {
    resident.world.removePlayer(m.seatId);
    // E7：进本携带已穿戴装备（世界镜像缓存 → maxHp/attrs 应用到副本 actor）。
    // E9：进本携带等级（levelBySeat 缓存 → attrs 反映真实等级）。
    getWorld(instanceRoomId)?.addPlayer(m.seatId, m.userId, spec.entryTile, equipBySeat.get(m.seatId), levelBySeat.get(m.seatId), materialBySeat.get(m.seatId));
  }

  // 2g. 进入 waiting（E13 集合缓冲）：lockTick 用 RESIDENT world tick（D9 可确定性推进）；
  //     寿命 wall-clock（C-Dgn-4：30min）。窗口结束 / 满员 → sweep 锁定 → 移入 instances。
  const expireAt = Date.now() + (opts.lifetimeMs ?? DUNGEON_EXPIRE_MS);
  waitingInstances.set(entranceId, {
    entranceId,
    instanceRoomId,
    members: [...members],
    seed,
    biomeId,
    entryTile: spec.entryTile,
    lockTick: resident.world.tick + PARTY_GATHER_WINDOW_TICKS,
    expireAt,
  });

  return { ok: true, joined: false, instanceRoomId };
}

/**
 * E5/E13：出本/解散。
 * - **等待中（waiting，集合缓冲内）**：
 *     · 带 `opts.seatId` → **取消该成员**：从 waiting.members + room.members 移除、
 *       出副本 world、回 RESIDENT 安全区（出本归位 + 订阅切回主世界）；无成员则销毁 waiting 实例；
 *     · 不带 `opts.seatId` → **整体解散**（expiry / 显式解散全部成员）。
 * - **锁定后（instances）**：现有逻辑 —— 停 instance run（未拾取掉落随 world 销毁）、
 *   全部成员回 RESIDENT 安全区、instance room 销毁（多成员各出）。
 */
export function exitInstance(
  instanceRoomId: string,
  opts: { seatId?: number } = {},
): { ok: boolean; reason?: string } {
  const resident = runs.get(RESIDENT_ROOM_ID);

  // ① waiting 实例：取消单成员 / 整体解散。
  for (const [entranceId, w] of [...waitingInstances.entries()]) {
    if (w.instanceRoomId !== instanceRoomId) continue;
    const idx = opts.seatId !== undefined ? w.members.findIndex((m) => m.seatId === opts.seatId) : -1;
    if (idx >= 0) {
      // 单成员取消（E13 等待中玩家可取消）：移除成员 + 出副本 world + 回主世界安全区。
      const [m] = w.members.splice(idx, 1);
      leaveRoom(instanceRoomId, m.userId);
      getWorld(instanceRoomId)?.removePlayer(m.seatId);
      if (resident) resident.world.addPlayer(m.seatId, m.userId, RESPAWN_POS, equipBySeat.get(m.seatId), levelBySeat.get(m.seatId), materialBySeat.get(m.seatId));
      const connId = activeUserConn.get(m.userId);
      if (connId) setRoom(connId, RESIDENT_ROOM_ID); // 无连接则忽略（掉线成员由重连流程接管）
      // 无成员 → 销毁 waiting 实例。
      if (w.members.length === 0) {
        waitingInstances.delete(entranceId);
        stopRun(instanceRoomId);
        destroyRoom(instanceRoomId);
      }
      return { ok: true };
    }
    // 无 seatId / seatId 不在 waiting → 整体解散（expiry / 显式解散全部成员）。
    waitingInstances.delete(entranceId);
    for (const m of w.members) {
      if (resident) resident.world.addPlayer(m.seatId, m.userId, RESPAWN_POS, equipBySeat.get(m.seatId), levelBySeat.get(m.seatId), materialBySeat.get(m.seatId));
      const connId = activeUserConn.get(m.userId);
      if (connId) setRoom(connId, RESIDENT_ROOM_ID);
    }
    stopRun(instanceRoomId);
    destroyRoom(instanceRoomId);
    return { ok: true };
  }

  // ② 锁定实例：现有解散逻辑（停 run + 全部成员回 RESIDENT 安全区 + room 销毁）。
  const meta = instances.get(instanceRoomId);
  if (!meta) return { ok: false, reason: "NOT_AN_INSTANCE" };
  instances.delete(instanceRoomId);

  // 停 instance run（未拾取掉落随实例销毁）。
  stopRun(instanceRoomId);

  // 存活成员回 RESIDENT 安全区（出本归位；连接订阅原子切回主世界）。
  for (const m of meta.members) {
    // E7：出本携带已穿戴装备（世界镜像缓存 → 回主世界 actor 保留 maxHp/attrs）。
    // E9：出本携带等级（levelBySeat 缓存 → 回主世界 actor attrs 反映真实等级）。
    if (resident) resident.world.addPlayer(m.seatId, m.userId, RESPAWN_POS, equipBySeat.get(m.seatId), levelBySeat.get(m.seatId), materialBySeat.get(m.seatId));
    const connId = activeUserConn.get(m.userId);
    if (connId) setRoom(connId, RESIDENT_ROOM_ID); // 无连接则忽略（掉线成员由重连流程接管）
  }

  // instance 房间销毁（成员 / 重连 token 一并清理）。
  destroyRoom(instanceRoomId);
  return { ok: true };
}

/**
 * E5/E13：副本寿命巡检（C-Dgn-4）。到点自动解散全部成员。
 * ① 先 sweep waiting（窗口到期 → 锁定开本）；② waiting 实例超时未锁 → 解散；
 * ③ 锁定实例寿命到点 → 解散。
 * @param now  wall-clock ms（测试可注入未来时刻）。
 * @returns 被解散的 instance roomIds
 */
export function checkInstanceExpiry(now = Date.now()): string[] {
  const expired: string[] = [];
  // E13：先锁定已到窗口的 waiting 实例（窗口结束 → 正式开本）。
  sweepWaitingInstances();
  // ① waiting 实例寿命到点（超时未锁）→ 解散（exitInstance 无 seatId → 整体解散）。
  for (const [, w] of [...waitingInstances.entries()]) {
    if (w.expireAt <= now) {
      exitInstance(w.instanceRoomId);
      expired.push(w.instanceRoomId);
    }
  }
  // ② 锁定实例寿命到点 → 解散（C-Dgn-4 现有）。
  for (const [roomId, meta] of [...instances.entries()]) {
    if (meta.expireAt <= now) {
      exitInstance(roomId);
      expired.push(roomId);
    }
  }
  return expired;
}

/** 副本世界尺寸（px），与 createWorld 默认 40×30 tile 一致（dungeonGen 布局按此网格）。 */
const GRID_W_PX = 40 * TILE;
const GRID_H_PX = 30 * TILE;

/**
 * E6：背包数据通道（控制面）。拾取入库成功后，向该 seatId 对应连接推送
 * `{ type: "character.inventory", items, equipped, cap }`（登录玩家；游客不经过本函数，C-Per-1 零持久写）。
 * E7：items 携带 slot（itemProto 确定性推导）；equipped 携带 3 槽已穿戴（客户端装备栏/属性面板）。
 * E19：items/equipped 携带 enchantLevel；消息携带 materials（强化石计数，客户端一次拉全）。
 * seatId → userId（CharacterService.getSeatInfo）→ connId（activeUserConn）→ sendToConn。
 * C6：run-manager → connection-registry（叶子），方向合法；不反向被 sim-core import。
 */
export function pushInventoryToSeat(seatId: number, inventory: Inventory, equipped?: EquippedSlots, materials = 0): void {
  const cs = activeCharacterService;
  const info = cs?.getSeatInfo(seatId);
  if (!info) return; // 座位未登记（未知 seatId）→ 忽略
  const connId = activeUserConn.get(info.userId);
  if (!connId) return; // 该用户当前无连接（离线）→ 忽略（重连时经 character.inventory.get 拉取）
  sendToConn(connId, {
    type: "character.inventory",
    items: inventory.items.map((i) => ({
      itemId: i.itemId,
      rarity: i.rarity,
      affixes: [...i.affixes],
      slot: itemProto(i.itemId).slot,
      ...(i.enchantLevel ? { enchantLevel: i.enchantLevel } : {}),
    })),
    equipped: equipped ?? {},
    cap: INVENTORY_CAP,
    materials,
  });
}

// ─────────────────────────────────────────────────────────────
// E9：升级数据通道（控制面 character.level）
// ─────────────────────────────────────────────────────────────
// 镜像 E6 背包通道：世界升级事件 → 登录落库（Character.level/exp）+ 向 seat 连接推送
// `{ type: "character.level", level, xp, xpNext }`（登录玩家；游客零持久写 + 不推送，C-Per-1）。

/**
 * E9：向 seatId 对应连接推送 character.level（登录玩家；游客/离线忽略，C-Per-1）。
 * seatId → userId（CharacterService.getSeatInfo）→ connId（activeUserConn）→ sendToConn。
 */
export function pushLevelToSeat(seatId: number, level: number, xp: number, xpNext: number): void {
  const cs = activeCharacterService;
  const info = cs?.getSeatInfo(seatId);
  if (!info || info.guest) return; // 未知座位 / 游客 → 不推送（C-Per-1）
  const connId = activeUserConn.get(info.userId);
  if (!connId) return; // 离线 → 忽略（重连时经 character.level.get 拉取）
  sendToConn(connId, { type: "character.level", level, xp, xpNext });
}

/**
 * E9：升级落库 + 推送（登录玩家；升级事件后由 handleLevelUp 调用）。
 * - Character.level = 升级后等级；Character.exp = 当前剩余经验（world 会话内权威，升级时同步）；
 * - 落库后向 seat 连接推送 character.level（客户端经验条 / 升级特效）。
 * 调用方为 run-manager.onTick（async 触发、不阻塞 12Hz 循环，镜像 applyPickupToInventory）。
 */
export async function applyLevelUpToCharacter(
  cs: CharacterService,
  userId: string,
  level: number,
  xp: number,
  xpNext: number,
): Promise<void> {
  const { snapshot, seatId } = await cs.loadOrCreate(userId);
  const character = { ...snapshot.character, level, exp: xp, updatedAt: Date.now() };
  await cs.save(userId, { character, inventory: snapshot.inventory });
  // P0 修复：同步 session.snapshot，防止 autosave/下线 save 覆盖升级结果。
  seatSnapshotSyncer?.(seatId, { character, inventory: snapshot.inventory });
  pushLevelToSeat(seatId, level, xp, xpNext);
}

/**
 * E9：升级事件接线（startRun onTick → 本函数；登录落库 + 推送，游客忽略 C-Per-1）。
 * 同时更新 levelBySeat 缓存（供换域 addPlayer 时播种等级 → attrs 反映真实等级）。
 */
function handleLevelUp(roomId: string, seatId: number, level: number, xp: number, xpNext: number): void {
  const cs = activeCharacterService;
  if (!cs) return; // 未注入服务 → 仅维持世界内升级（actor attrs 已更新）
  const info = cs.getSeatInfo(seatId);
  if (!info || info.guest) return; // 游客 → 零持久写 + 不推送（C-Per-1）
  levelBySeat.set(seatId, level); // 世界镜像缓存（换域 addPlayer 应用）
  void applyLevelUpToCharacter(cs, info.userId, level, xp, xpNext).catch(() => {});
}

/**
 * E19：强化石落库 + 推送（登录玩家；精英/BOSS 击杀事件后由 handleMaterialGain 调用）。
 * - Character.materials = 原值 + 本次击杀获得石数（world 事件 stones 为**增量**，权威累加）；
 * - 落库后向 seat 连接推送 character.inventory（含 materials 字段，客户端一次拉全）；
 * - 更新 materialBySeat 缓存（换域 addPlayer 播种世界镜像计数）。
 * 调用方为 run-manager.onTick（async 触发、不阻塞 12Hz 循环，镜像 applyLevelUpToCharacter）。
 */
export async function applyMaterialGainToCharacter(
  cs: CharacterService,
  userId: string,
  seatId: number,
  stones: number,
): Promise<void> {
  const { snapshot } = await cs.loadOrCreate(userId);
  const materials = (snapshot.character.materials ?? 0) + stones;
  const character = { ...snapshot.character, materials, updatedAt: Date.now() };
  await cs.save(userId, { character, inventory: snapshot.inventory });
  // P0 修复：同步 session.snapshot，防止 autosave/下线 save 覆盖强化石结果。
  seatSnapshotSyncer?.(seatId, { character, inventory: snapshot.inventory });
  materialBySeat.set(seatId, materials); // 世界镜像缓存（换域 addPlayer 播种）
  pushInventoryToSeat(seatId, snapshot.inventory, snapshot.character.equipped, materials);
}

/**
 * E19：强化石获得事件接线（startRun onTick → 本函数；登录落库 + 推送，游客忽略 C-Per-1）。
 * 同时更新 materialBySeat 缓存（供换域 addPlayer 时播种强化石计数）。
 */
function handleMaterialGain(seatId: number, stones: number): void {
  const cs = activeCharacterService;
  if (!cs) return; // 未注入服务 → 仅维持世界内计数（actor.materials 已累计）
  const info = cs.getSeatInfo(seatId);
  if (!info || info.guest) return; // 游客 → 零持久写 + 不推送（C-Per-1）
  void applyMaterialGainToCharacter(cs, info.userId, seatId, stones).catch(() => {});
}

/**
 * E4 服务端背包接线（尽力项，C-Per-3 闭环）：把一次拾取应用到登录玩家背包。
 * - 经 CharacterService.loadOrCreate 取角色快照（含背包）；
 * - inventory.addItem：未满则入库，满 → 返回溢出物品；
 * - 溢出 → inventory.toGroundLoot（带 ttlTicks）→ world.spawnGroundLoot 落回玩家脚下地面（TTL 自动消失）。
 * - E6：入库成功后经 pushInventoryToSeat 向该 seat 连接推送 character.inventory（控制面背包面板）。
 *
 * 调用方（默认 run-manager.handlePickup 接线 / 自定义 onPickup）应在 onPickup 回调内对「登录玩家」
 * 调用本函数；游客不入库（C-Per-1），直接忽略（handlePickup 经 getSeatInfo 判定）。
 * 本函数为 async（CharacterService 落库为 IO），run-manager onTick 以 void 触发、不阻塞 12Hz 循环。
 */
export async function applyPickupToInventory(
  cs: CharacterService,
  userId: string,
  world: World,
  loot: LootResult,
): Promise<void> {
  const { snapshot, seatId } = await cs.loadOrCreate(userId);
  const item: InventoryItem = {
    itemId: loot.itemId,
    rarity: loot.rarity,
    affixes: loot.affixes,
    slot: itemProto(loot.itemId).slot, // E7：slot 由 itemId 确定性推导（掉落后再映射）
  };
  const { inventory, overflow } = addItem(snapshot.inventory, item);
  await cs.save(userId, { character: snapshot.character, inventory });
  // P0 修复：同步 session.snapshot，防止 autosave/下线 save 覆盖拾取结果。
  seatSnapshotSyncer?.(seatId, { character: snapshot.character, inventory });
  if (overflow) {
    // 背包满 → 溢出落脚下地面（C-Per-3）。
    world.spawnGroundLoot(seatId, toGroundLoot(overflow));
  }
  // E6：拾取入库成功 → 控制面推送背包（登录玩家；游客不经过本函数，C-Per-1）。
  // E7：equipped 显式传入（equipBySeat 缓存），避免拾取推送把客户端装备栏清空。
  // E19：materials 一并推送（Character.materials 快照，客户端一次拉全）。
  pushInventoryToSeat(seatId, inventory, equipBySeat.get(seatId), snapshot.character.materials ?? 0);
}

/**
 * E20：宝箱开箱批量入库（服务端背包接线，C-Per-3 闭环；一次开箱多件装备）。
 * - 经 CharacterService.loadOrCreate 取角色快照（含背包）；
 * - items（3-5 件，必含 1 暗金 + 金/蓝）逐件 inventory.addItem：未满入库，满 → 溢出收集；
 * - 强化石×2（E19 材料计数，Character.materials 累加）与物品**同一原子 save**（防并发落库竞态：
 *   若材料走独立事件则两次 save 交错可能把材料写回旧值——本函数单次落库保证一致）；
 * - 溢出 → 全部 world.spawnGroundLoot 落回玩家脚下地面（C-Per-3，TTL 自动消失）；
 * - 落库后经 pushInventoryToSeat 推送 character.inventory（items + equipped + materials 一次拉全）；
 * - 更新 materialBySeat 缓存（换域 addPlayer 播种强化石计数）。
 * 调用方（默认 run-manager.handleChestOpen 接线）应在 onChestOpen 回调内对「登录玩家」调用；
 * 游客不入库（C-Per-1）。本函数为 async（CharacterService 落库 IO），onTick 以 void 触发、不阻塞 12Hz 循环。
 */
export async function applyChestOpenToInventory(
  cs: CharacterService,
  userId: string,
  world: World,
  items: LootResult[],
  stones: number,
): Promise<void> {
  const { snapshot, seatId } = await cs.loadOrCreate(userId);
  let inventory = snapshot.inventory;
  const overflows: InventoryItem[] = [];
  for (const loot of items) {
    const item: InventoryItem = {
      itemId: loot.itemId,
      rarity: loot.rarity,
      affixes: loot.affixes,
      slot: itemProto(loot.itemId).slot, // E7：slot 由 itemId 确定性推导
    };
    const { inventory: next, overflow } = addItem(inventory, item);
    inventory = next;
    if (overflow) overflows.push(overflow);
  }
  // E19：强化石×2（Character.materials 累加；单次 save 原子性见函数头注释）。
  const materials = (snapshot.character.materials ?? 0) + stones;
  const character = { ...snapshot.character, materials, updatedAt: Date.now() };
  await cs.save(userId, { character, inventory });
  // P0 修复：同步 session.snapshot，防止 autosave/下线 save 覆盖开箱结果。
  seatSnapshotSyncer?.(seatId, { character, inventory });
  for (const o of overflows) {
    // 背包满 → 溢出落脚下地面（C-Per-3）。
    world.spawnGroundLoot(seatId, toGroundLoot(o));
  }
  materialBySeat.set(seatId, materials); // 世界镜像缓存（换域 addPlayer 播种）
  pushInventoryToSeat(seatId, inventory, equipBySeat.get(seatId), materials);
}

/**
 * E20：宝箱开箱事件接线（startRun onTick → 本函数；登录批量入库 + 材料累加 + 推送，游客忽略 C-Per-1）。
 */
function handleChestOpen(roomId: string, seatId: number, items: LootResult[], stones: number): void {
  const cs = activeCharacterService;
  if (!cs) return; // 未注入服务 → 仅维持 world 内事件缓冲
  const info = cs.getSeatInfo(seatId);
  if (!info || info.guest) return; // 游客 → 零持久写 + 不推送（C-Per-1）
  const world = getWorld(roomId);
  if (!world) return;
  void applyChestOpenToInventory(cs, info.userId, world, items, stones).catch(() => {});
}
