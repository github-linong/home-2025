/**
 * protocol.ts — 控制面纯消息分派（E1.S1.2 / S1.6，脱离 ws 可单测）
 * ===========================================================================
 * 复用参照（语义对齐 dungeon-online protocol.ts + poker gateway 的 dispatch 分层）：
 *   把「业务分派」从「ws 接线」剥离为纯函数，便于用 fake Conn 单测，无需起真实 ws 服务。
 *
 * 控制面（C4）：所有消息显式带 `"type"` 字段，分派按 type switch —— **禁止形状猜测路由**。
 * 数据面 InputCmd 不经本分派，由 gateway 直接路由到 run-manager（C6 纪律 B 解耦）。
 *
 * 分派结果只描述「要发的回复 + 要广播的消息」，由 gateway 落到 connection-registry。
 */

import {
  ensureResidentRoom,
  joinResident,
  createInstanceRoom,
  validateReconnect,
  getRoom,
  getInstanceRoom,
  roomSnapshot,
  RESIDENT_ROOM_ID,
} from "./room-service.ts";
import {
  startRun,
  getSnapshot,
  enterInstance,
  exitInstance,
  isInstanceRunning,
  setPlayerEquipped, // E7：equip/unequip → 世界镜像（maxHp/attrs 即时生效）
  pushInventoryToSeat, // E7：装备变更后推送背包（含 equipped）
} from "./run-manager.ts";
import { RoomPhase } from "../sim-core/src/types.ts";
import { INVENTORY_CAP } from "../sim-core/src/constants.ts"; // C7 单一来源（背包上限）
import { itemProto, type EquippedSlots } from "../sim-core/src/affixes.ts"; // E7：slot 推导 / 装备槽
import { encodeSnapshot } from "./protocol-binary.ts";
import { generateId } from "./ids.ts";
import { config } from "./config.ts";
import type { CharacterService, Inventory, InventoryItem, CharacterSnapshot } from "./persistence.ts"; // 仅类型（resolveInventoryGet 运行时经注入的模块级引用）

export interface ProtocolContext {
  readonly userId: string;
  readonly connId: string;
  /** 会话座位号（网关从 liveSessions 注入；进本/出本用）。 */
  readonly seatId?: number;
  /** 连接当前归属房间（网关注入；dungeon.enter 校验须在主世界，C-Net-1 域边界）。 */
  readonly roomId?: string | null;
}

export type BroadcastInstr =
  | { kind: "room"; roomId: string; message: unknown; binary?: boolean }
  | { kind: "conn"; connId: string; message: unknown; binary?: boolean };

export interface DispatchResult {
  reply?: unknown;
  broadcasts?: BroadcastInstr[];
  /** 本连接应归属的 roomId（gateway 调 setRoom）。 */
  roomId?: string | null;
}

/** 控制面错误回复（equip/unequip 等异步路径返回）。 */
export interface GameErrorReply {
  readonly type: "game.error";
  readonly requestId?: string;
  readonly error: { readonly code: string; readonly message: string };
}

function err(requestId: string | undefined, code: string, message: string): GameErrorReply {
  return { type: "game.error", requestId, error: { code, message } };
}

// ─────────────────────────────────────────────────────────────
// E6 背包数据通道（控制面）：character.inventory
// ─────────────────────────────────────────────────────────────
// dispatch 为同步纯函数（D9 纪律），而背包拉取依赖 CharacterService（async IO）。
// 故 `character.inventory.get` 由 gateway 显式 type 路由到本文件的异步解析函数（C4），
// 业务逻辑（guest 空背包 / 登录读背包）仍收在本协议层，便于 fake ctx 单测。
// C6：gateway → protocol（调用方向合法）；protocol → persistence（叶子服务）。

/** 模块级角色服务引用（gateway.createGateway 启动时注入，镜像 run-manager 模式）。 */
let protocolCharacterService: CharacterService | null = null;

export function setProtocolCharacterService(cs: CharacterService | null): void {
  protocolCharacterService = cs;
}

/** character.inventory 消息体（推送与 get 回复同一格式，供客户端背包面板对接）。 */
export interface InventoryItemView {
  readonly itemId: number;
  readonly rarity: number;
  readonly affixes: readonly number[];
  /** E7：物品槽位（itemProto 确定性推导；客户端装备栏/换装用）。 */
  readonly slot: "weapon" | "armor" | "trinket";
}

/** 已穿戴装备视图（客户端装备栏渲染用；slot 即键）。 */
export interface EquippedView {
  readonly weapon?: { readonly itemId: number; readonly rarity: number; readonly affixes: readonly number[] };
  readonly armor?: { readonly itemId: number; readonly rarity: number; readonly affixes: readonly number[] };
  readonly trinket?: { readonly itemId: number; readonly rarity: number; readonly affixes: readonly number[] };
}

export interface InventoryMessage {
  readonly type: "character.inventory";
  readonly requestId?: string;
  readonly items: readonly InventoryItemView[];
  /** E7：3 槽已穿戴（客户端装备栏）。 */
  readonly equipped: EquippedView;
  readonly cap: number; // 背包上限（INVENTORY_CAP=60）
}

/** EquippedSlots → EquippedView（去 slot 键、展平 affixes；缺省空槽）。 */
function equippedView(equipped: EquippedSlots | undefined): EquippedView {
  return {
    ...(equipped?.weapon
      ? { weapon: { itemId: equipped.weapon.itemId, rarity: equipped.weapon.rarity, affixes: [...equipped.weapon.affixes] } }
      : {}),
    ...(equipped?.armor
      ? { armor: { itemId: equipped.armor.itemId, rarity: equipped.armor.rarity, affixes: [...equipped.armor.affixes] } }
      : {}),
    ...(equipped?.trinket
      ? { trinket: { itemId: equipped.trinket.itemId, rarity: equipped.trinket.rarity, affixes: [...equipped.trinket.affixes] } }
      : {}),
  };
}

/** 背包 → 消息 items 视图（slot 由 itemId 推导）。 */
function itemsView(inventory: Inventory): InventoryItemView[] {
  return inventory.items.map((i) => ({
    itemId: i.itemId,
    rarity: i.rarity,
    affixes: [...i.affixes],
    slot: itemProto(i.itemId).slot,
  }));
}

function inventoryMessage(requestId: string | undefined, inventory: Inventory, equipped: EquippedSlots | undefined): InventoryMessage {
  return {
    type: "character.inventory",
    requestId,
    items: itemsView(inventory),
    equipped: equippedView(equipped),
    cap: INVENTORY_CAP,
  };
}

function equipError(requestId: string | undefined, code: string, message: string): GameErrorReply {
  return err(requestId, code, message);
}

/**
 * 处理 `character.inventory.get`（异步）：登录玩家返回持久化背包；游客/未知座位回空 items
 * （C-Per-1 零持久写不涉及：游客不 loadOrCreate，直接空背包）。E7：附带 equipped。
 */
export async function resolveInventoryGet(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string },
): Promise<InventoryMessage> {
  const empty = (): InventoryMessage => ({
    type: "character.inventory",
    requestId: msg.requestId,
    items: [],
    equipped: {},
    cap: INVENTORY_CAP,
  });
  const cs = protocolCharacterService;
  const seatId = ctx.seatId;
  if (!cs || seatId === undefined) return empty();
  const info = cs.getSeatInfo(seatId);
  if (!info || info.guest) return empty(); // 游客 / 未知座位 → 空背包（C-Per-1）
  const { snapshot } = await cs.loadOrCreate(info.userId);
  return inventoryMessage(msg.requestId, snapshot.inventory, snapshot.character.equipped);
}

/** 校验登录 + 取角色快照（equip/unequip 共用；游客 → 错误）。 */
async function loadLoginSnapshot(
  ctx: ProtocolContext,
  requestId: string | undefined,
): Promise<
  | { ok: true; cs: CharacterService; userId: string; seatId: number; snapshot: CharacterSnapshot }
  | { ok: false; reply: unknown }
> {
  const cs = protocolCharacterService;
  const seatId = ctx.seatId;
  if (!cs || seatId === undefined) return { ok: false, reply: equipError(requestId, "NO_SEAT", "session not attached") };
  const info = cs.getSeatInfo(seatId);
  if (!info || info.guest) return { ok: false, reply: equipError(requestId, "NOT_LOGGED_IN", "equip requires a persistent character") };
  const { snapshot } = await cs.loadOrCreate(info.userId);
  return { ok: true, cs, userId: info.userId, seatId, snapshot };
}

/**
 * E7：处理 `character.equip { itemId }`（异步）。
 * - 从背包移除物品 → 装入对应槽（slot 由 itemProto(itemId) 推导）；
 * - 换装：原槽装备回背包（若背包满 → 拒绝，防丢物）；
 * - 落库 + 世界镜像（setPlayerEquipped，maxHp/attrs 即时生效）+ 回推 character.inventory。
 */
export async function resolveEquip(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string; payload?: Record<string, unknown> },
): Promise<InventoryMessage | GameErrorReply> {
  const requestId = msg.requestId;
  const loaded = await loadLoginSnapshot(ctx, requestId);
  if (!loaded.ok) return loaded.reply as never;
  const { snapshot, userId, seatId } = loaded;

  const itemId = Number(msg.payload?.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return equipError(requestId, "BAD_ITEM_ID", `invalid itemId: ${itemId}`);
  }
  const idx = snapshot.inventory.items.findIndex((i) => i.itemId === itemId);
  if (idx < 0) return equipError(requestId, "ITEM_NOT_FOUND", `item ${itemId} not in inventory`);

  const item: InventoryItem = snapshot.inventory.items[idx];
  const slot = itemProto(item.itemId).slot;
  const equipped: EquippedSlots = { ...(snapshot.character.equipped ?? {}) };
  const old = equipped[slot];

  // 换装：原槽装备回背包；剩余 + 旧件 不得超过背包上限（防丢物，C-Per-3 边界）。
  const remaining = snapshot.inventory.items.filter((_, i) => i !== idx);
  if (old) remaining.push(old);
  if (remaining.length > INVENTORY_CAP) {
    return equipError(requestId, "BAG_FULL", "unequipping would overflow bag");
  }
  equipped[slot] = { itemId: item.itemId, rarity: item.rarity, affixes: [...item.affixes] };

  const inventory: Inventory = { items: remaining };
  await loaded.cs.save(userId, { character: { ...snapshot.character, equipped }, inventory });
  // 世界镜像：当前房间世界 actor 应用装备（maxHp/attrs 即时生效；未入房则仅缓存等 addPlayer）。
  setPlayerEquipped(ctx.roomId ?? undefined, seatId, equipped);
  pushInventoryToSeat(seatId, inventory, equipped);
  return inventoryMessage(requestId, inventory, equipped);
}

/**
 * E7：处理 `character.unequip { slot }`（异步）。
 * - 从槽位卸下 → 回背包（背包满 → 拒绝）；
 * - 空槽 → SLOT_EMPTY 错误；非法 slot → BAD_SLOT。
 */
export async function resolveUnequip(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string; payload?: Record<string, unknown> },
): Promise<InventoryMessage | GameErrorReply> {
  const requestId = msg.requestId;
  const loaded = await loadLoginSnapshot(ctx, requestId);
  if (!loaded.ok) return loaded.reply as never;
  const { snapshot, userId, seatId } = loaded;

  const slot = String(msg.payload?.slot ?? "");
  if (slot !== "weapon" && slot !== "armor" && slot !== "trinket") {
    return equipError(requestId, "BAD_SLOT", `invalid slot: ${slot}`);
  }
  const equipped: EquippedSlots = { ...(snapshot.character.equipped ?? {}) };
  const old = equipped[slot];
  if (!old) return equipError(requestId, "SLOT_EMPTY", `slot ${slot} is empty`);

  if (snapshot.inventory.items.length >= INVENTORY_CAP) {
    return equipError(requestId, "BAG_FULL", "bag is full");
  }
  delete equipped[slot];
  const inventory: Inventory = { items: [...snapshot.inventory.items, old] };

  await loaded.cs.save(userId, { character: { ...snapshot.character, equipped }, inventory });
  setPlayerEquipped(ctx.roomId ?? undefined, seatId, equipped);
  pushInventoryToSeat(seatId, inventory, equipped);
  return inventoryMessage(requestId, inventory, equipped);
}

export function dispatch(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string; payload?: Record<string, unknown> },
): DispatchResult {
  const { type, requestId, payload = {} } = msg;
  const broadcasts: BroadcastInstr[] = [];

  switch (type) {
    // 加入主世界 RESIDENT（任意加入，无房间码）。
    case "room.join": {
      const room = joinResident(ctx.userId);
      const member = room.members.get(ctx.userId)!;
      broadcasts.push({ kind: "room", roomId: room.roomId, message: roomSnapshot(room) });
      return {
        reply: {
          type: "room.join.ok",
          requestId,
          roomId: room.roomId,
          resident: room.resident,
          reconnectToken: member.reconnectToken,
        },
        broadcasts,
        roomId: room.roomId,
      };
    }

    // 创建副本 instance（E1 占位：创建即锁定成员 + 起 stub run；E5 起真实入口走 dungeon.enter）。
    case "room.create_instance": {
      const room = createInstanceRoom([ctx.userId]);
      const member = room.members.get(ctx.userId)!;
      startRun({
        runId: generateId("run"),
        roomId: room.roomId,
        seed: room.roomId, // E1 占位 seed（E5 改 instanceSeed 服务端权威）
        phase: RoomPhase.DUNGEON,
        lootTokens: 4,
      });
      broadcasts.push({ kind: "room", roomId: room.roomId, message: roomSnapshot(room) });
      return {
        reply: {
          type: "room.create_instance.ok",
          requestId,
          roomId: room.roomId,
          reconnectToken: member.reconnectToken,
        },
        broadcasts,
        roomId: room.roomId,
      };
    }

    // 进入副本实例（E5 · ADR-JH-ENG-03 §3）：仅允许在主世界 RESIDENT 触发（C-Net-1 域边界）。
    case "dungeon.enter": {
      if (ctx.roomId !== RESIDENT_ROOM_ID) {
        return { reply: err(requestId, "NOT_IN_RESIDENT", "dungeon.enter requires resident world") };
      }
      if (ctx.seatId === undefined) {
        return { reply: err(requestId, "NO_SEAT", "session not attached") };
      }
      const entranceId = Number(payload.entranceId ?? 0);
      // MVP 单人进本（成员锁定 = 触发者）；多人「集合缓冲取先到者」归 Phase-2（dungeon §⑧）。
      const res = enterInstance(entranceId, [{ seatId: ctx.seatId, userId: ctx.userId }]);
      if (!res.ok) {
        return { reply: err(requestId, res.reason ?? "ENTER_FAILED", "enter instance rejected") };
      }
      const instRoom = getInstanceRoom(res.instanceRoomId!);
      const member = instRoom?.members.get(ctx.userId);
      if (instRoom) broadcasts.push({ kind: "room", roomId: instRoom.roomId, message: roomSnapshot(instRoom) });
      return {
        reply: {
          type: "dungeon.enter.ok",
          requestId,
          roomId: res.instanceRoomId,
          // 副本内重连 token（C-Net-3/C10：寿命内回本）。
          reconnectToken: member?.reconnectToken,
        },
        broadcasts,
        roomId: res.instanceRoomId, // 网关 setRoom 原子切到 instance（C-Net-2）
      };
    }

    // 出本（E5）：停 instance run、成员回 RESIDENT 安全区、订阅切回主世界（C-Net-2）。
    case "dungeon.exit": {
      const roomId = ctx.roomId;
      if (!roomId || !isInstanceRunning(roomId)) {
        return { reply: err(requestId, "NOT_IN_INSTANCE", "dungeon.exit requires instance room") };
      }
      const res = exitInstance(roomId);
      if (!res.ok) {
        return { reply: err(requestId, res.reason ?? "EXIT_FAILED", "exit instance rejected") };
      }
      const resident = getRoom(RESIDENT_ROOM_ID);
      if (resident) broadcasts.push({ kind: "room", roomId: RESIDENT_ROOM_ID, message: roomSnapshot(resident) });
      return {
        reply: { type: "dungeon.exit.ok", requestId, roomId: RESIDENT_ROOM_ID },
        broadcasts,
        roomId: RESIDENT_ROOM_ID, // 网关 setRoom 原子切回主世界（C-Net-2）
      };
    }

    // 重连（chat 模型复用，C-Net-3）：寿命内回原副本；原房间已销毁（副本超时/解散）→ 回主世界（C10）。
    case "session.reconnect": {
      const roomId = String(payload.roomId ?? "");
      const reconnectToken = String(payload.reconnectToken ?? "");
      const room = getRoom(roomId);
      if (!room) {
        // 原副本已销毁 → 回主世界安全区（C-Net-3 / C10 重连无跳变）。
        const resident = joinResident(ctx.userId);
        const member = resident.members.get(ctx.userId)!;
        broadcasts.push({ kind: "room", roomId: resident.roomId, message: roomSnapshot(resident) });
        const snap = getSnapshot(resident.roomId);
        if (snap) {
          broadcasts.push({ kind: "conn", connId: ctx.connId, message: encodeSnapshot(snap), binary: true });
        }
        return {
          reply: {
            type: "session.reconnect.ok",
            requestId,
            roomId: resident.roomId,
            reconnectToken: member.reconnectToken,
            snapshotTick: snap?.tick ?? 0,
            fellBackToResident: true,
          },
          broadcasts,
          roomId: resident.roomId,
        };
      }
      try {
        const { reconnectToken: newToken } = validateReconnect(roomId, ctx.userId, reconnectToken);
        broadcasts.push({ kind: "room", roomId, message: roomSnapshot(room) });
        const snap = getSnapshot(roomId);
        if (snap) {
          // 数据面：全量快照经二进制通道下发到本连接（C5 双平面）。
          broadcasts.push({
            kind: "conn",
            connId: ctx.connId,
            message: encodeSnapshot(snap),
            binary: true,
          });
        }
        return {
          reply: {
            type: "session.reconnect.ok",
            requestId,
            roomId,
            reconnectToken: newToken,
            snapshotTick: snap?.tick ?? 0,
          },
          broadcasts,
          roomId,
        };
      } catch (e) {
        return { reply: err(requestId, "RECONNECT_EXPIRED", (e as Error).message) };
      }
    }

    // 拉取全量快照（数据面二进制，下发到本连接）。
    case "sync.request": {
      const roomId = String(payload.roomId ?? "");
      const snap = getSnapshot(roomId);
      if (!snap) return { reply: err(requestId, "RUN_NOT_FOUND", "no active run") };
      broadcasts.push({
        kind: "conn",
        connId: ctx.connId,
        message: encodeSnapshot(snap),
        binary: true,
      });
      return {
        reply: { type: "sync.request.ok", requestId, tick: snap.tick },
        broadcasts,
      };
    }

    default:
      return { reply: err(requestId, "INVALID_ACTION", `Unknown type: ${type}`) };
  }
}

// 确保 RESIDENT 房在协议层可用（server 启动已 ensure，此处防御）。
export function ensureBaseRooms(): void {
  ensureResidentRoom();
  void config;
}
