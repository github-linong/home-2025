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
import { RoomPhase, type WorldSnapshot, type InputCmd } from "../sim-core/src/types.ts";
import {
  TILE,
  RESPAWN_POS,
  DUNGEON_EXPIRE_MS,
  INVENTORY_CAP, // E6：背包数据通道 cap（C7 单一来源）
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
  RESIDENT_ROOM_ID,
} from "./room-service.ts";
import type { CharacterService, InventoryItem, Inventory } from "./persistence.ts";
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
   * 拾取回调（可选）。每次玩家拾取地面掉落时触发（seatId + 掉落）。
   * **默认已接**（F1）：bootResidentRun / enterInstance 传 `handlePickup` —— seatId → 登录/游客解析，
   * 登录玩家经 applyPickupToInventory 落背包，游客直接忽略（C-Per-1 零持久写）。
   * 调用方可用自定义回调覆盖（如测试注入）；不传则仅维持 sim-core 地面掉落生命周期（掉落→ttl→拾取移除），不落背包。
   */
  readonly onPickup?: (seatId: number, loot: LootResult) => void;
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
 * E7：seatId → 已穿戴装备（世界面向缓存）。
 * - 持久化（Character.equipped）为耐用权威；本 Map 是「世界镜像」同步缓存：
 *   装备变更（protocol resolveEquip/Unequip）与 addPlayerToRoom（room.join）时写入，
 *   enterInstance / exitInstance 换域 addPlayer 时读取（避免异步 loadOrCreate 塞进同步路径）。
 * - 同一进程内与持久化保持一致（equip 请求同时落库 + 写 Map）；服务重启后由
 *   gateway room.join 经 snapshot.character.equipped 重新播种。
 */
const equipBySeat = new Map<number, EquippedSlots>();

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
  });

  const handle = startRunLoop({
    onTick(_tick, _inputs) {
      world.step();
      // E4/F1：取走本 tick 拾取事件，转发给服务端 onPickup 钩子（默认 handlePickup：登录入库、游客忽略，C-Per-1）。
      for (const p of world.consumePickups()) {
        opts.onPickup?.(p.seatId, p.loot);
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
export function addPlayerToRoom(roomId: string, seatId: number, userId: string, equipped?: EquippedSlots): void {
  const entry = runs.get(roomId);
  if (!entry) return;
  // E7：room.join 播种装备（持久化镜像 → 世界）。游客/未装备 → undefined → 基础属性。
  if (equipped !== undefined) equipBySeat.set(seatId, equipped);
  entry.world.addPlayer(seatId, userId, undefined, equipBySeat.get(seatId));
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

/** 是否活跃副本 instance（E5：dungeon.exit 校验用）。 */
export function isInstanceRunning(roomId: string): boolean {
  return instances.has(roomId);
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
  });
}

/**
 * E5：进入副本实例（ADR-JH-ENG-03 §3）。
 * 流程：RESIDENT tick → seed → 布局 → instance room（成员锁定）→ 独立 world → 成员切域。
 * - seed 仅服务端计算持有，**不返回给客户端路径**（C-Dgn-1）；
 * - 入口冷却由 RESIDENT world.tryEnterEntrance 权威校验（C-Dgn-4）；
 * - 成员锁定后 members[] 不可变（C-Dgn-2）。
 */
export interface EnterInstanceOpts {
  readonly biomeId?: number;
  /** 副本寿命（ms），缺省 DUNGEON_EXPIRE_MS=30min（C-Dgn-4）。测试可注入短寿命。 */
  readonly lifetimeMs?: number;
}

export function enterInstance(
  entranceId: number,
  members: readonly InstanceMember[],
  opts: EnterInstanceOpts = {},
): { ok: boolean; reason?: string; instanceRoomId?: string } {
  // ① 取 RESIDENT 当前权威 tick（客户端不可知 ⇒ seed 不可预测，C-Dgn-1）。
  const resident = runs.get(RESIDENT_ROOM_ID);
  if (!resident) return { ok: false, reason: "RESIDENT_NOT_RUNNING" };
  const serverTick = resident.handle.getTick();

  // ② 入口冷却（C-Dgn-4：10s 防刷本；服务端权威闸门）。
  if (!resident.world.tryEnterEntrance(serverTick)) {
    return { ok: false, reason: "ENTRANCE_COOLDOWN" };
  }

  if (members.length === 0) return { ok: false, reason: "NO_MEMBERS" };

  // ③ seed = hash(serverTick + entranceId + partyTag)；partyTag=首个触发者（dungeon §⑥）。
  const partyTag = members[0].userId;
  const seed = computeInstanceSeed(serverTick, entranceId, partyTag).toString();
  const biomeId = opts.biomeId ?? 0;

  // ④ 确定性布局 + 副本规格（BOSS 置最深层，C-Dgn-3；刷怪密度 ×1.5）。
  const spec = buildDungeonSpec(seed, biomeId);

  // ⑤ 建 instance 房间（成员锁定，C-Dgn-2）+ 独立 world + 12Hz run（独立广播域，C-Net-1）。
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
    // F1（P1）：副本拾取同样落背包（登录入库、游客忽略 C-Per-1）。
    onPickup: (seatId, loot) => handlePickup(instanceRoomId, seatId, loot),
  });

  // 成员实体：出 RESIDENT 世界 + 进 instance 世界（域切换；C-Net-1 不混流大图）。
  for (const m of members) {
    resident.world.removePlayer(m.seatId);
    // E7：进本携带已穿戴装备（世界镜像缓存 → maxHp/attrs 应用到副本 actor）。
    getWorld(instanceRoomId)?.addPlayer(m.seatId, m.userId, spec.entryTile, equipBySeat.get(m.seatId));
  }

  // ⑥ 寿命记录（C-Dgn-4：30min；wall-clock 计时，循环停滞不误判）。
  const expireAt = Date.now() + (opts.lifetimeMs ?? DUNGEON_EXPIRE_MS);
  instances.set(instanceRoomId, { entranceId, biomeId, seed, members, expireAt });

  return { ok: true, instanceRoomId };
}

/**
 * E5：出本/解散。停 instance run（未拾取地面掉落随 world 销毁）、
 * 存活成员回 RESIDENT 安全区（出本归位 + 连接订阅切回主世界）、instance room 销毁。
 */
export function exitInstance(instanceRoomId: string): { ok: boolean; reason?: string } {
  const meta = instances.get(instanceRoomId);
  if (!meta) return { ok: false, reason: "NOT_AN_INSTANCE" };
  instances.delete(instanceRoomId);

  // 停 instance run（未拾取掉落随实例销毁）。
  stopRun(instanceRoomId);

  // 存活成员回 RESIDENT 安全区（出本归位；连接订阅原子切回主世界）。
  const resident = runs.get(RESIDENT_ROOM_ID);
  for (const m of meta.members) {
    // E7：出本携带已穿戴装备（世界镜像缓存 → 回主世界 actor 保留 maxHp/attrs）。
    if (resident) resident.world.addPlayer(m.seatId, m.userId, RESPAWN_POS, equipBySeat.get(m.seatId));
    const connId = activeUserConn.get(m.userId);
    if (connId) setRoom(connId, RESIDENT_ROOM_ID); // 无连接则忽略（掉线成员由重连流程接管）
  }

  // instance 房间销毁（成员 / 重连 token 一并清理）。
  destroyRoom(instanceRoomId);
  return { ok: true };
}

/**
 * E5：副本寿命巡检（C-Dgn-4）。到点自动 exitInstance 所有成员。
 * @param now  wall-clock ms（测试可注入未来时刻）。
 * @returns 被解散的 instance roomIds
 */
export function checkInstanceExpiry(now = Date.now()): string[] {
  const expired: string[] = [];
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
 * seatId → userId（CharacterService.getSeatInfo）→ connId（activeUserConn）→ sendToConn。
 * C6：run-manager → connection-registry（叶子），方向合法；不反向被 sim-core import。
 */
export function pushInventoryToSeat(seatId: number, inventory: Inventory, equipped?: EquippedSlots): void {
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
    })),
    equipped: equipped ?? {},
    cap: INVENTORY_CAP,
  });
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
  if (overflow) {
    // 背包满 → 溢出落脚下地面（C-Per-3）。
    world.spawnGroundLoot(seatId, toGroundLoot(overflow));
  }
  // E6：拾取入库成功 → 控制面推送背包（登录玩家；游客不经过本函数，C-Per-1）。
  // E7：equipped 显式传入（equipBySeat 缓存），避免拾取推送把客户端装备栏清空。
  pushInventoryToSeat(seatId, inventory, equipBySeat.get(seatId));
}
