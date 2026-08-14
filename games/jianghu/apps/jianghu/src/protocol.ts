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
  getWorld, // E21：usePotion 取当前 room world 权威 tick（副本用副本 world 的 tick）
  enterInstance,
  exitInstance,
  isInstanceRunning,
  setPlayerEquipped, // E7：equip/unequip → 世界镜像（maxHp/attrs 即时生效）
  pushInventoryToSeat, // E7：装备变更后推送背包（含 equipped）
  setPotionBySeat, // E21：使用药水后同步 potionBySeat 缓存（换域播种）
  canEnterInstance, // E16：入口服务端坐标校验（进本前检查玩家与 ENTRANCE 距离）
  enqueueSeatSave, // E22：分解落库经串行队列（与击杀材料/药水/升级并发安全）
  applyDisassembleToCharacter, // E22：分解落库 + 世界镜像同步（队列内执行）
} from "./run-manager.ts";
import { RoomPhase } from "../sim-core/src/types.ts";
import { INVENTORY_CAP, xpForLevel, ENCHANT_STONE_ITEM_ID, MAX_ENCHANT_LEVEL, ENCHANT_COST, POTION_CD_TICKS } from "../sim-core/src/constants.ts"; // C7 单一来源（背包上限 / 升级经验需求 / E19 强化常量 / E21 药水 CD）
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

/**
 * 会话快照同步器（gateway 注入）：equip/unequip 落库后同步 liveSessions 里该连接的
 * session.snapshot，否则 30s autosave / 下线 save 会用旧快照覆盖文件 → 装备丢失（P0 修复）。
 */
let protocolSnapshotSyncer: ((connId: string, snap: CharacterSnapshot) => void) | null = null;

export function setProtocolSnapshotSyncer(fn: ((connId: string, snap: CharacterSnapshot) => void) | null): void {
  protocolSnapshotSyncer = fn;
}

/** character.inventory 消息体（推送与 get 回复同一格式，供客户端背包面板对接）。 */
export interface InventoryItemView {
  readonly itemId: number;
  readonly rarity: number;
  readonly affixes: readonly number[];
  /** E7：物品槽位（itemProto 确定性推导；客户端装备栏/换装用）。 */
  readonly slot: "weapon" | "armor" | "trinket";
  /** E19：强化等级（+N；缺省 0 = 未强化）。 */
  readonly enchantLevel?: number;
  /** E32：套装 id（0/缺省 = 无套装）。 */
  readonly setId?: number;
}

/** 已穿戴装备视图（客户端装备栏渲染用；slot 即键）。 */
export interface EquippedItemView {
  readonly itemId: number;
  readonly rarity: number;
  readonly affixes: readonly number[];
  readonly enchantLevel?: number;
  /** E32：套装 id（0/缺省 = 无套装）。 */
  readonly setId?: number;
}

export interface EquippedView {
  readonly weapon?: EquippedItemView;
  readonly armor?: EquippedItemView;
  readonly trinket?: EquippedItemView;
}

export interface InventoryMessage {
  readonly type: "character.inventory";
  readonly requestId?: string;
  readonly items: readonly InventoryItemView[];
  /** E7：3 槽已穿戴（客户端装备栏）。 */
  readonly equipped: EquippedView;
  readonly cap: number; // 背包上限（INVENTORY_CAP=60）
  /** E19：强化石计数（Character.materials；客户端背包面板顶部「强化石 ×N」）。 */
  readonly materials: number;
  /** E21：药水计数（Character.potions；客户端 HUD 药水槽「Q 疗伤药 ×N」）。 */
  readonly potions: number;
}

/** EquippedSlots → EquippedView（去 slot 键、展平 affixes；缺省空槽）。E19：保留 enchantLevel。E32：保留 setId。 */
function equippedView(equipped: EquippedSlots | undefined): EquippedView {
  const toView = (item: { itemId: number; rarity: number; affixes: readonly number[]; enchantLevel?: number; setId?: number }): EquippedItemView => ({
    itemId: item.itemId,
    rarity: item.rarity,
    affixes: [...item.affixes],
    ...(item.enchantLevel ? { enchantLevel: item.enchantLevel } : {}),
    ...(item.setId ? { setId: item.setId } : {}),
  });
  return {
    ...(equipped?.weapon ? { weapon: toView(equipped.weapon) } : {}),
    ...(equipped?.armor ? { armor: toView(equipped.armor) } : {}),
    ...(equipped?.trinket ? { trinket: toView(equipped.trinket) } : {}),
  };
}

/** 背包 → 消息 items 视图（slot 由 itemId 推导）。E19：保留 enchantLevel。E32：保留 setId。 */
function itemsView(inventory: Inventory): InventoryItemView[] {
  return inventory.items.map((i) => ({
    itemId: i.itemId,
    rarity: i.rarity,
    affixes: [...i.affixes],
    slot: itemProto(i.itemId).slot,
    ...(i.enchantLevel ? { enchantLevel: i.enchantLevel } : {}),
    ...(i.setId ? { setId: i.setId } : {}),
  }));
}

function inventoryMessage(requestId: string | undefined, inventory: Inventory, equipped: EquippedSlots | undefined, materials: number, potions: number): InventoryMessage {
  return {
    type: "character.inventory",
    requestId,
    items: itemsView(inventory),
    equipped: equippedView(equipped),
    cap: INVENTORY_CAP,
    materials,
    potions,
  };
}

function equipError(requestId: string | undefined, code: string, message: string): GameErrorReply {
  return err(requestId, code, message);
}

/**
 * 处理 `character.inventory.get`（异步）：登录玩家返回持久化背包；游客/未知座位回空 items
 * （C-Per-1 零持久写不涉及：游客不 loadOrCreate，直接空背包）。E7：附带 equipped。E19：附带 materials。E21：附带 potions。
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
    materials: 0,
    potions: 0,
  });
  const cs = protocolCharacterService;
  const seatId = ctx.seatId;
  if (!cs || seatId === undefined) return empty();
  const info = cs.getSeatInfo(seatId);
  if (!info || info.guest) return empty(); // 游客 / 未知座位 → 空背包（C-Per-1）
  const { snapshot } = await cs.loadOrCreate(info.userId);
  return inventoryMessage(msg.requestId, snapshot.inventory, snapshot.character.equipped, snapshot.character.materials ?? 0, snapshot.character.potions ?? 0);
}

// ─────────────────────────────────────────────────────────────
// E9 等级数据通道（控制面）：character.level
// ─────────────────────────────────────────────────────────────
// 镜像 character.inventory：`character.level.get` 由 gateway 显式 type 路由到本函数（C4），
// 业务逻辑（guest 忽略 / 登录读持久化等级）收在本协议层，便于 fake ctx 单测。

/** character.level 消息体（推送与 get 回复同一格式，供客户端 HUD 经验条 + 等级展示）。 */
export interface LevelMessage {
  readonly type: "character.level";
  readonly requestId?: string;
  readonly level: number;
  /** 当前经验（升级后为剩余经验；Character.exp 同源）。 */
  readonly xp: number;
  /** 下一级所需经验（xpForLevel(level)，C7 单一来源）。 */
  readonly xpNext: number;
}

/**
 * 处理 `character.level.get`（异步）：登录玩家返回持久化等级/经验；
 * 游客/未知座位 → null（忽略，不回复；C-Per-1 零持久写不涉及）。
 */
export async function resolveLevelGet(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string },
): Promise<LevelMessage | null> {
  const cs = protocolCharacterService;
  const seatId = ctx.seatId;
  if (!cs || seatId === undefined) return null;
  const info = cs.getSeatInfo(seatId);
  if (!info || info.guest) return null; // 游客 / 未知座位 → 忽略（C-Per-1）
  const { snapshot } = await cs.loadOrCreate(info.userId);
  const level = Math.max(1, Math.trunc(snapshot.character.level ?? 1));
  const xp = Math.max(0, snapshot.character.exp ?? 0);
  return { type: "character.level", requestId: msg.requestId, level, xp, xpNext: xpForLevel(level) };
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
  // E19：装备入槽保留 enchantLevel（强化等级随穿戴生效，computeEquipStats 放大词缀）。
  // E32：装备入槽保留 setId（套装加成随穿戴生效，computeEquipStats 统计同 setId 件数）。
  equipped[slot] = {
    itemId: item.itemId,
    rarity: item.rarity,
    affixes: [...item.affixes],
    ...(item.enchantLevel ? { enchantLevel: item.enchantLevel } : {}),
    ...(item.setId ? { setId: item.setId } : {}),
  };

  const inventory: Inventory = { items: remaining };
  await loaded.cs.save(userId, { character: { ...snapshot.character, equipped }, inventory });
  // P0 修复：同步 session.snapshot，防止 autosave/下线 save 用旧快照覆盖文件（丢装备）。
  protocolSnapshotSyncer?.(ctx.connId, { character: { ...snapshot.character, equipped }, inventory });
  // 世界镜像：当前房间世界 actor 应用装备（maxHp/attrs 即时生效；未入房则仅缓存等 addPlayer）。
  setPlayerEquipped(ctx.roomId ?? undefined, seatId, equipped);
  pushInventoryToSeat(seatId, inventory, equipped, snapshot.character.materials ?? 0, snapshot.character.potions ?? 0);
  return inventoryMessage(requestId, inventory, equipped, snapshot.character.materials ?? 0, snapshot.character.potions ?? 0);
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
  protocolSnapshotSyncer?.(ctx.connId, { character: { ...snapshot.character, equipped }, inventory });
  setPlayerEquipped(ctx.roomId ?? undefined, seatId, equipped);
  pushInventoryToSeat(seatId, inventory, equipped, snapshot.character.materials ?? 0, snapshot.character.potions ?? 0);
  return inventoryMessage(requestId, inventory, equipped, snapshot.character.materials ?? 0, snapshot.character.potions ?? 0);
}

/**
 * E19：处理 `character.enchant { itemId }`（异步，仿 equip）。
 * - 目标：背包物品（itemId 在背包）或**已装备物品**（itemId 在 equipped 槽，防御数据完整性）；
 * - 校验：itemId 合法整数 / 非强化石（ENCHANT_STONE_ITEM_ID，强化石不可强化）/
 *   enchantLevel < MAX_ENCHANT_LEVEL(=5) / materials ≥ ENCHANT_COST(=1 石/次)；
 * - 效果：item.enchantLevel = (enchantLevel ?? 0) + 1；词缀强度在**属性计算时**放大
 *   （computeEquipStats：词缀 value ×(1 + 0.15×level)，不存词缀表）；消耗 1 强化石；
 * - MVP **不失败**（100% 成功，友善）；回推 character.inventory（items/equipped/materials）；
 * - 已装备目标 → setPlayerEquipped 重算世界 actor 属性（maxHp/attrs 即时生效）；
 * - 落库 + P0 syncer（protocolSnapshotSyncer 防 autosave/下线覆盖）。
 */
export async function resolveEnchant(
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
  // 强化石不可强化（材料计数，非装备；防御 crafted/旧存档注入）。
  if (itemId === ENCHANT_STONE_ITEM_ID) {
    return equipError(requestId, "ENCHANT_MATERIAL", "enchant stone cannot be enchanted");
  }

  // 目标定位：背包优先；未在背包 → 已装备槽（防御：equipped 物品强化需同步 actor 属性）。
  const bagIdx = snapshot.inventory.items.findIndex((i) => i.itemId === itemId);
  const equipped: EquippedSlots = { ...(snapshot.character.equipped ?? {}) };
  let targetSlot: "weapon" | "armor" | "trinket" | null = null;
  if (bagIdx < 0) {
    for (const slot of ["weapon", "armor", "trinket"] as const) {
      if (equipped[slot]?.itemId === itemId) { targetSlot = slot; break; }
    }
    if (!targetSlot) return equipError(requestId, "ITEM_NOT_FOUND", `item ${itemId} not in inventory or equipped`);
  }

  const curLevel = bagIdx >= 0
    ? (snapshot.inventory.items[bagIdx].enchantLevel ?? 0)
    : (equipped[targetSlot!]!.enchantLevel ?? 0);
  if (curLevel >= MAX_ENCHANT_LEVEL) {
    return equipError(requestId, "ENCHANT_MAX_LEVEL", `item already at max enchant level (+${MAX_ENCHANT_LEVEL})`);
  }
  const materials = snapshot.character.materials ?? 0;
  if (materials < ENCHANT_COST) {
    return equipError(requestId, "NO_MATERIALS", `need ${ENCHANT_COST} enchant stone(s), have ${materials}`);
  }

  const nextLevel = curLevel + 1;
  const newMaterials = materials - ENCHANT_COST;

  // 应用：背包物品原地更新；已装备目标更新槽位（含 enchantLevel）。
  let inventory = snapshot.inventory;
  if (bagIdx >= 0) {
    inventory = {
      items: snapshot.inventory.items.map((it, i) =>
        i === bagIdx ? { ...it, enchantLevel: nextLevel } : it,
      ),
    };
  } else {
    const slot = targetSlot!;
    equipped[slot] = { ...equipped[slot]!, enchantLevel: nextLevel };
  }
  const character = { ...snapshot.character, equipped, materials: newMaterials, updatedAt: Date.now() };

  await loaded.cs.save(userId, { character, inventory });
  // P0 修复：同步 session.snapshot，防止 autosave/下线 save 用旧快照覆盖强化结果。
  protocolSnapshotSyncer?.(ctx.connId, { character, inventory });
  // 已装备目标 → 世界 actor 属性重算（maxHp/attrs 即时生效；背包目标不触世界镜像）。
  if (targetSlot) setPlayerEquipped(ctx.roomId ?? undefined, seatId, equipped);
  pushInventoryToSeat(seatId, inventory, equipped, newMaterials, snapshot.character.potions ?? 0);
  return inventoryMessage(requestId, inventory, equipped, newMaterials, snapshot.character.potions ?? 0);
}

/**
 * E22：处理 `character.disassemble { itemId }`（异步，仿 resolveEnchant）。
 * - 校验：登录玩家（游客 → NOT_LOGGED_IN，C-Per-1）/ itemId 合法整数 /
 *   在背包（ITEM_NOT_FOUND）/ 不在已装备槽（EQUIPPED_ITEM，已装备先卸下）/
 *   非材料物品（ENCHANT_STONE_ITEM_ID → NOT_DISASSEMBLABLE，强化石不入包防御）；
 * - 产出：DISASSEMBLE_STONES_BY_RARITY[rarity] 强化石 + DISASSEMBLE_POTIONS 药水（固定 1 瓶保底）；
 * - 从背包移除该物品 → Character.materials += 石、Character.potions += 药水；
 * - **落库经 enqueueSeatSave 串行队列**（与击杀材料/药水/升级落库同队列——分解也改计数，
 *   并发不串行会写回旧计数丢材料/药水，P1/E21 竞态模式）+ P0 syncer（applyDisassembleToCharacter
 *   内 seatSnapshotSyncer 同步 session.snapshot，防 autosave/下线覆盖）；
 * - 世界镜像：applyDisassembleToCharacter 内 setPlayerCounters 同步缓存 + world actor（有 actor 时）；
 * - 回推 character.inventory（items 减 + materials/potions 增量，客户端一次拉全）。
 */
export async function resolveDisassemble(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string; payload?: Record<string, unknown> },
): Promise<InventoryMessage | GameErrorReply> {
  const requestId = msg.requestId;
  const loaded = await loadLoginSnapshot(ctx, requestId);
  if (!loaded.ok) return loaded.reply as never;
  const { cs, userId, seatId } = loaded;

  const itemId = Number(msg.payload?.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return equipError(requestId, "BAD_ITEM_ID", `invalid itemId: ${itemId}`);
  }

  // 队列内执行完整「load → 校验 → 移除 → 计数累加 → save → syncer → 世界镜像 → 推送」，
  // 与击杀材料/药水落库串行（防并发竞态覆盖）；applyDisassembleToCharacter 内部做权威重查。
  const result = await enqueueSeatSave(seatId, () =>
    applyDisassembleToCharacter(cs, userId, seatId, itemId, { roomId: ctx.roomId }),
  );
  if (!result.ok) {
    return equipError(requestId, result.code, result.message);
  }
  return inventoryMessage(requestId, result.inventory, result.equipped, result.materials, result.potions);
}

/** character.potion 消息体（使用药水成功回推；客户端刷新药水槽 + CD 环 + 回血飘字）。 */
export interface PotionMessage {
  readonly type: "character.potion";
  readonly requestId?: string;
  /** 使用后药水数（= 持久化 Character.potions，客户端一次拉全）。 */
  readonly count: number;
  /** 本轮 CD 剩余（tick）= POTION_CD_TICKS（使用瞬间为全量 5s；客户端按 msg.tick + 本值推算 CD 环）。 */
  readonly cdTicksLeft: number;
  /** 本次实际回血量（≤ round(maxHp×0.3)，clamp 到 maxHp；客户端绿字飘字）。 */
  readonly healed: number;
  /** 使用时的 world tick（客户端 CD 环截止点 = tick + cdTicksLeft）。 */
  readonly tick: number;
}

/**
 * E21：处理 `character.usePotion`（异步，仿 equip 模式）。
 * - 校验（服务端权威，world.usePotion）：登录玩家（游客 → NOT_LOGGED_IN，C-Per-1）、
 *   在房间内（NO_ROOM）、potionCount > 0（NO_POTIONS）、hp < maxHp（FULL_HP 满血不可用）、
 *   CD 到（POTION_CD → world tick 判定，副本用副本 world 的 tick）；
 * - 生效：world actor 回血（hp = min(maxHp, hp + round(maxHp×0.3))）、potionCount -= 1、
 *   lastPotionTick = nowTick（下一快照自然下发回血后 hp）；
 * - 落库 Character.potions（以 world actor 使用后计数为准，防并发双发竞态覆盖）+ P0 syncer；
 * - 回推 character.potion（count/cdTicksLeft/healed/tick）+ character.inventory（potions 字段一次拉全）。
 */
export async function resolveUsePotion(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string },
): Promise<PotionMessage | GameErrorReply> {
  const requestId = msg.requestId;
  const loaded = await loadLoginSnapshot(ctx, requestId);
  if (!loaded.ok) return loaded.reply as never;
  const { snapshot, userId, seatId } = loaded;

  const world = ctx.roomId ? getWorld(ctx.roomId) : null;
  if (!world) return err(requestId, "NOT_IN_ROOM", "use potion requires being in a room");
  // 用 world tick 判定 CD（服务端权威；玩家在副本 → 副本 world 的 tick）。
  const res = world.usePotion(seatId, world.tick);
  if (!res.ok) {
    if (res.reason === "NO_POTIONS") return err(requestId, "NO_POTIONS", "no potions left");
    if (res.reason === "FULL_HP") return err(requestId, "FULL_HP", "hp already full");
    if (res.reason === "ON_CD") return err(requestId, "POTION_CD", `potion on cooldown (${res.cdTicksLeft ?? 0} ticks left)`);
    return err(requestId, "NO_ACTOR", "player not in world");
  }

  // 落库：以 world actor 使用后计数（res.count）为权威（与 world 镜像锁步，防并发双发竞态覆盖）。
  const potions = res.count!;
  const character = { ...snapshot.character, potions, updatedAt: Date.now() };
  await loaded.cs.save(userId, { character, inventory: snapshot.inventory });
  // P0 修复：同步 session.snapshot，防止 autosave/下线 save 覆盖药水使用结果。
  protocolSnapshotSyncer?.(ctx.connId, { character, inventory: snapshot.inventory });
  setPotionBySeat(seatId, potions);
  pushInventoryToSeat(seatId, snapshot.inventory, snapshot.character.equipped, snapshot.character.materials ?? 0, potions);
  return {
    type: "character.potion",
    requestId,
    count: potions,
    cdTicksLeft: res.cdTicksLeft ?? POTION_CD_TICKS,
    healed: res.healed ?? 0,
    tick: res.tick ?? world.tick,
  };
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

    // 进入副本实例（E5/E13 · ADR-JH-ENG-03 §3 + 入口集合缓冲）：仅允许在主世界 RESIDENT 触发
    // （C-Net-1 域边界）。E13：同入口 waiting 窗口内的成员加入同一实例（多人同本），
    // 锁定后拒绝（INSTANCE_LOCKED，C-Dgn-2）；副本内再 enter → NOT_IN_RESIDENT。
    case "dungeon.enter": {
      if (ctx.roomId !== RESIDENT_ROOM_ID) {
        return { reply: err(requestId, "NOT_IN_RESIDENT", "dungeon.enter requires resident world") };
      }
      if (ctx.seatId === undefined) {
        return { reply: err(requestId, "NO_SEAT", "session not attached") };
      }
      // E16：入口服务端坐标校验（主世界 RESIDENT 玩家 pos 与 ENTRANCE 距离 ≤ 1.5×TILE）。
      // 之前仅客户端校验（任意位置可进本）；此处补服务端权威闸门（C11）。出本 dungeon.exit 不做坐标校验。
      const atEntrance = canEnterInstance(ctx.seatId);
      if (!atEntrance.ok) {
        return { reply: err(requestId, atEntrance.reason ?? "NOT_AT_ENTRANCE", "enter instance requires standing at entrance") };
      }
      const entranceId = Number(payload.entranceId ?? 0);
      // E13：进入或加入（多人同本 —— 同入口 waiting 窗口内加入同一实例）。
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
          // E13：多人同本 —— 返回成员数 + 是否加入已有 waiting 实例（客户端队伍 UI 用）。
          memberCount: instRoom?.members.size ?? 0,
          joined: res.joined ?? false,
          // 副本内重连 token（C-Net-3/C10：寿命内回本）。
          reconnectToken: member?.reconnectToken,
        },
        broadcasts,
        roomId: res.instanceRoomId, // 网关 setRoom 原子切到 instance（C-Net-2）
      };
    }

    // 出本（E5/E13）：等待中 → 取消该成员（回 RESIDENT）；锁定后 → 停 instance run、
    // 成员回 RESIDENT 安全区、订阅切回主世界（C-Net-2）。
    case "dungeon.exit": {
      const roomId = ctx.roomId;
      if (!roomId || !isInstanceRunning(roomId)) {
        return { reply: err(requestId, "NOT_IN_INSTANCE", "dungeon.exit requires instance room") };
      }
      // E13：传 seatId → 等待中取消单成员（其他成员留本）；锁定实例忽略 seatId（整体解散）。
      const res = exitInstance(roomId, { seatId: ctx.seatId });
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
