/**
 * persistence.ts — 角色持久化双模式（E2 · ADR-JH-ENG-02 / C-Per-1..4）
 * ===========================================================================
 * 职责：
 *   - 定义 Character（等级/EXP/属性 STR·DEX·VIT/位置）+ Inventory（≤60）的 load/save 接口。
 *   - 提供可插拔存储：MemoryCharacterStore（默认）/ JsonFileCharacterStore（JSON 文件）。
 *     真实 DB 留 TODO（不阻塞 MVP）。sim-core 保持纯函数无 IO；落库在 server 层（本文件）。
 *   - 双模式编排（CharacterService）：
 *       · 登录玩家 → 从存储加载 / 首次创建并落库；分配 seatId（seat/player 映射）。
 *       · 游客     → 零持久写（C-Per-1）：不加载、不创建、不保存。
 *   - 客人→登录不合并（锁定决策）：login 永远加载/创建**独立**角色，绝不读客人进度。
 *
 * 落库时机（架构 §7）：关键事件（创建/加入/下线）+ 30s 定时（gateway 层驱动）。
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { INVENTORY_CAP, LOOT_GROUND_TTL_TICKS, PLAYER_BASE_ATTRS } from "../sim-core/src/constants.ts"; // C7 单一来源
import type { AttrSet, Vec2 } from "../sim-core/src/types.ts";
import type { EquippedSlots, ItemSlot } from "../sim-core/src/affixes.ts"; // E7：装备槽（仅类型）
import { itemProto } from "../sim-core/src/affixes.ts"; // E7：旧存档 slot 归一化（确定性推导）
import { config } from "./config.ts";
import type { VerifiedIdentity } from "./auth.ts";

// ─────────────────────────────────────────────────────────────
// 领域类型
// ─────────────────────────────────────────────────────────────

/**
 * 背包物品（持久化最小单元）。
 * slot 为**派生字段**（itemProto(itemId).slot 确定性推导）：E7 后新增，旧持久化 JSON 无此字段
 * → 标记可选；消费侧（inventory 消息 / equip）一律用 itemProto(itemId).slot 取权威槽位。
 */
export interface InventoryItem {
  readonly itemId: number;
  /** 0=白 1=蓝 2=金 3=暗金（与 sim-core AFFIX_COUNTS 对齐）。 */
  readonly rarity: number;
  readonly affixes: readonly number[];
  /** 物品槽位（weapon|armor|trinket；可缺省，消费侧按 itemId 推导）。 */
  readonly slot?: ItemSlot;
  /** E19：强化等级（+N；可缺省 = 未强化，旧存档兼容）。仅在属性计算时放大词缀值，不存词缀表。 */
  readonly enchantLevel?: number;
}

/** 背包（≤ INVENTORY_CAP）。 */
export interface Inventory {
  readonly items: readonly InventoryItem[];
}

/** 角色（Character，ADR-JH-ENG-02）。 */
export interface Character {
  readonly userId: string;
  level: number;
  exp: number;
  attrs: AttrSet;
  pos: Vec2;
  /** E7：已穿戴装备（3 槽；可缺省 = 未穿戴，旧角色兼容）。 */
  equipped?: EquippedSlots;
  /** E19：强化石计数（材料；可缺省 = 0，旧角色兼容）。独立于背包（强化石不入包）。 */
  materials?: number;
  /** E21：药水计数（消耗品；可缺省 = 0，旧角色兼容）。独立于背包（药水不入包）。MVP 开局 2 瓶（新手友好）。 */
  potions?: number;
  /** 最近落库时间（ms）；仅服务端维护。 */
  updatedAt: number;
}

/** 角色 + 背包快照（落库单元）。 */
export interface CharacterSnapshot {
  readonly character: Character;
  readonly inventory: Inventory;
}

/**
 * 座位信息（seatId → userId + 是否游客）。
 * 供 run-manager 拾取回调做「登录/游客」解析（F1 接线）：游客零持久写（C-Per-1），登录才落背包。
 */
export interface SeatInfo {
  readonly userId: string;
  readonly guest: boolean;
}

// ─────────────────────────────────────────────────────────────
// 存储接口（可插拔）
// ─────────────────────────────────────────────────────────────

export interface CharacterStore {
  load(userId: string): Promise<CharacterSnapshot | null>;
  save(userId: string, snap: CharacterSnapshot): Promise<void>;
  exists(userId: string): Promise<boolean>;
}

/** 内存存储（默认；进程级单例，真实 DB 留 TODO）。 */
export class MemoryCharacterStore implements CharacterStore {
  private readonly data = new Map<string, CharacterSnapshot>();
  /** 测试可观测计数。 */
  saveCount = 0;
  loadCount = 0;

  async load(userId: string): Promise<CharacterSnapshot | null> {
    this.loadCount += 1;
    return this.data.get(userId) ?? null;
  }
  async save(userId: string, snap: CharacterSnapshot): Promise<void> {
    this.saveCount += 1;
    this.data.set(userId, snap);
  }
  async exists(userId: string): Promise<boolean> {
    return this.data.has(userId);
  }
  /** 测试辅助：当前所有持久化 userId（断言游客零持久写）。 */
  keys(): string[] {
    return [...this.data.keys()];
  }
}

/** JSON 文件存储（可插拔第二实现；每 userId 一个文件，便于本地持久）。 */
export class JsonFileCharacterStore implements CharacterStore {
  private readonly cache = new Map<string, CharacterSnapshot>();
  private writeCount = 0;
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private fileFor(userId: string): string {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.dir, `${safe}.json`);
  }

  async load(userId: string): Promise<CharacterSnapshot | null> {
    const cached = this.cache.get(userId);
    if (cached) return cached;
    try {
      const raw = await readFile(this.fileFor(userId), "utf8");
      const snap = JSON.parse(raw) as CharacterSnapshot;
      // E7：旧存档归一化（equipped 缺省空槽；item slot 按 itemId 确定性推导）。
      const normalized: CharacterSnapshot = {
        character: { ...snap.character, equipped: snap.character.equipped ?? {} },
        inventory: {
          items: snap.inventory.items.map((i) => ({ ...i, slot: i.slot ?? itemProto(i.itemId).slot })),
        },
      };
      this.cache.set(userId, normalized);
      return normalized;
    } catch {
      return null;
    }
  }

  async save(userId: string, snap: CharacterSnapshot): Promise<void> {
    this.cache.set(userId, snap);
    await mkdir(dirname(this.fileFor(userId)), { recursive: true });
    await writeFile(this.fileFor(userId), JSON.stringify(snap), "utf8");
    this.writeCount += 1;
  }

  async exists(userId: string): Promise<boolean> {
    if (this.cache.has(userId)) return true;
    try {
      await readFile(this.fileFor(userId), "utf8");
      return true;
    } catch {
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 新角色工厂 + 默认数值
// ─────────────────────────────────────────────────────────────

/** 新角色基础属性（STR·DEX·VIT）。C7 单一来源：来自 sim-core PLAYER_BASE_ATTRS（world 快照同源）。 */
export const DEFAULT_ATTRS: AttrSet = Object.freeze({ ...PLAYER_BASE_ATTRS });

/** 主世界安全区出生点（tile 对齐，48px）。死亡回安全区（决策④）。 */
export const SAFE_SPAWN: Vec2 = Object.freeze({ x: 16 * 48, y: 15 * 48 });

/** 创建新角色快照（Lv1 / EXP0 / 基础属性 / 安全区 / 空装备 / 0 强化石 / 2 瓶疗伤药）。 */
export function createNewCharacter(userId: string, now: number = Date.now()): CharacterSnapshot {
  return {
    character: {
      userId,
      level: 1,
      exp: 0,
      attrs: { ...DEFAULT_ATTRS },
      pos: { ...SAFE_SPAWN },
      equipped: {}, // E7：空装备槽
      materials: 0, // E19：0 强化石
      potions: 2, // E21：MVP 开局 2 瓶疗伤药（新手友好——当前无其它回血手段，红瓶是生存核心）
      updatedAt: now,
    },
    inventory: { items: [] },
  };
}

// ─────────────────────────────────────────────────────────────
// 编排服务（双模式 choke point）
// ─────────────────────────────────────────────────────────────

export interface CharacterServiceDeps {
  readonly store: CharacterStore;
  readonly now?: () => number;
}

/**
 * 角色编排服务：双模式唯一入口（gateway 调用）。
 * - begin(identity)：登录 → loadOrCreate（落库新角色）；游客 → 零持久写，返回 null 快照。
 * - assignSeat / getSeat：userId → seatId（seat/player 映射，供 E3 movement 路由）。
 * - save：关键事件落库（仅登录玩家）。
 */
export class CharacterService {
  private readonly store: CharacterStore;
  private readonly now: () => number;
  private readonly seatById = new Map<string, number>();
  /** seatId → 座位信息（begin 时登记；拾取回调据此判登录/游客，C-Per-1）。 */
  private readonly seatInfoById = new Map<number, SeatInfo>();
  private nextSeat = 1;

  constructor(deps: CharacterServiceDeps) {
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
  }

  /**
   * 开始一个连接会话（双模式 choke point）。
   * - 游客（identity.guest）：不加载、不创建、不落库（C-Per-1）；分配 seatId 仅供本会话使用。
   * - 登录：loadOrCreate → 已有则加载，否则创建新角色并立即落库（防丢失）。
   */
  async begin(identity: VerifiedIdentity): Promise<{
    seatId: number;
    snapshot: CharacterSnapshot | null;
    created: boolean;
  }> {
    const seatId = this.assignSeat(identity.userId);
    // F1 接线：登记 seatId → {userId, guest}，供 run-manager 拾取回调解析（游客零持久写，C-Per-1）。
    this.seatInfoById.set(seatId, { userId: identity.userId, guest: identity.guest });
    if (identity.guest) {
      // 游客：零持久写。不调用 store.load / store.save。
      return { seatId, snapshot: null, created: false };
    }
    const existing = await this.store.load(identity.userId);
    if (existing) {
      return { seatId, snapshot: existing, created: false };
    }
    const fresh = createNewCharacter(identity.userId, this.now());
    await this.store.save(identity.userId, fresh); // 新角色立即落库
    return { seatId, snapshot: fresh, created: true };
  }

  /** 登录玩家：加载已有或创建新角色（不用于游客）。 */
  async loadOrCreate(userId: string): Promise<{ snapshot: CharacterSnapshot; seatId: number; created: boolean }> {
    const r = await this.begin({ userId, guest: false });
    return { snapshot: r.snapshot!, seatId: r.seatId, created: r.created };
  }

  /** 分配/复用 seatId（userId → seatId 映射）。 */
  assignSeat(userId: string): number {
    let seat = this.seatById.get(userId);
    if (seat === undefined) {
      seat = this.nextSeat++;
      this.seatById.set(userId, seat);
    }
    return seat;
  }

  getSeat(userId: string): number | undefined {
    return this.seatById.get(userId);
  }

  /**
   * seatId → 座位信息（userId + 是否游客）。未登记（尚未 begin 的座位）返回 undefined。
   * F1 拾取接线：onPickup 回调据此跳过游客（C-Per-1 零持久写）并对登录玩家落背包。
   */
  getSeatInfo(seatId: number): SeatInfo | undefined {
    return this.seatInfoById.get(seatId);
  }

  /** 关键事件 / 定时落库（仅登录玩家调用）。 */
  async save(userId: string, snapshot: CharacterSnapshot): Promise<void> {
    await this.store.save(userId, snapshot);
  }

  exists(userId: string): Promise<boolean> {
    return this.store.exists(userId);
  }
}

// ─────────────────────────────────────────────────────────────
// 默认服务工厂（server 层 / gateway 默认）
// ─────────────────────────────────────────────────────────────

let defaultService: CharacterService | null = null;

/**
 * 进程级默认 CharacterService：按 config 选择存储（jsonStoreDir 非空 → JSON 文件，否则内存）。
 * gateway 在无注入时使用；测试可传入独立服务实例以隔离状态。
 */
export function getDefaultCharacterService(): CharacterService {
  if (!defaultService) {
    const store = config.jsonStoreDir
      ? new JsonFileCharacterStore(config.jsonStoreDir)
      : new MemoryCharacterStore();
    defaultService = new CharacterService({ store });
  }
  return defaultService;
}

/** 测试辅助：重置默认服务单例（避免跨用例串扰）。 */
export function _resetDefaultCharacterService(): void {
  defaultService = null;
}
