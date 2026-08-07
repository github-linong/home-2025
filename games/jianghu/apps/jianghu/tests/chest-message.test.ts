/**
 * chest-message.test.ts — E20 BOSS 宝箱开箱 → 背包/材料推送（编排层接线）
 * ===========================================================================
 * 覆盖（无真实 ws / DB；MemoryCharacterStore in-memory fake，复用既有测试模式）：
 *   ① 全链路（真实 run loop）：登录 → 击杀 BOSS → 宝箱刷出 → INTERACT 开箱 →
 *      run-manager onTick consumeChestOpens → applyChestOpenToInventory →
 *      Character.inventory 落库（3-5 件）+ Character.materials +2 + 推送 character.inventory
 *      （items + materials 一次拉全）；
 *   ② 溢出（C-Per-3）：背包满（≥ INVENTORY_CAP）→ 开箱溢出不入库 → world.spawnGroundLoot
 *      落回脚下（地面出现溢出物品实体）；
 *   ③ 游客开箱 → 零持久写 + 不推送（C-Per-1）。
 *
 * 说明：① 用真实 startRun（自定义 onChestOpen 接线 applyChestOpenToInventory，等价 bootResidentRun
 *   默认接线）驱动 12Hz run loop，覆盖 run-manager 消费事件 → 落库 → 推送的编排闭环；
 *   ② 直接驱动 applyChestOpenToInventory（仿 material-drop.test 直接驱动事件先例），确定性断言溢出。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  startRun,
  stopRun,
  getWorld,
  setActiveCharacterService,
  applyChestOpenToInventory,
  enqueueInput,
} from "../src/run-manager.ts";
import {
  CharacterService,
  MemoryCharacterStore,
  createNewCharacter,
  type CharacterSnapshot,
} from "../src/persistence.ts";
import {
  registerConnection,
  removeConnection,
  type Conn,
} from "../src/connection-registry.ts";
import { RoomPhase, EntityKind, InputAction, type InputCmd } from "../sim-core/src/types.ts";
import { TILE, INVENTORY_CAP, CHEST_STONES, CHEST_ITEM_COUNT_MIN, CHEST_ITEM_COUNT_MAX } from "../sim-core/src/constants.ts";
import { LOOT_GROUND_TTL_TICKS } from "../src/inventory.ts";

/** fake Conn：记录控制面 JSON（复用既有测试模式）。 */
function fakeConn(userId: string): { conn: Conn; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const conn: Conn = {
    connId: "",
    userId,
    roomId: null,
    send(payload: string | Uint8Array, opts?: { binary?: boolean }) {
      if (opts?.binary) return; // 数据面二进制不参与本测试
      sent.push(JSON.parse(payload as string) as Record<string, unknown>);
    },
  };
  return { conn, sent };
}

async function waitUntil(
  cond: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 4000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout waiting for: ${what}`);
}

function invMsg(sent: Record<string, unknown>[]) {
  return sent.find((m) => (m as { type?: string }).type === "character.inventory") as
    | { type: string; items: { itemId: number; rarity: number }[]; equipped: unknown; cap: number; materials: number }
    | undefined;
}

/** 建一个「BOSS 在角落」的 run（真实 startRun + 12Hz loop；onChestOpen 接 applyChestOpenToInventory）。 */
function bootChestRun(opts: { roomId: string; seed: string; cs: CharacterService }): void {
  const cs = opts.cs;
  startRun({
    runId: "r-" + opts.roomId,
    roomId: opts.roomId,
    seed: opts.seed,
    phase: RoomPhase.OVERWORLD,
    spawnZones: [
      { pos: { x: 3 * TILE, y: 3 * TILE }, tier: 2, enemyTypeId: "b", count: 1, respawnTicks: 100000, aggression: "passive" },
    ],
    // 等价 bootResidentRun 默认接线（登录入库 + 材料累加 + 推送；游客忽略 C-Per-1）。
    onChestOpen: (seatId, items, stones) => {
      const world = getWorld(opts.roomId);
      if (!world) return;
      const info = cs.getSeatInfo(seatId);
      if (!info || info.guest) return; // 游客零持久写（C-Per-1）
      void applyChestOpenToInventory(cs, info.userId, world, items, stones).catch(() => {});
    },
  });
}

// ------------------------------------------------------------------
// ① 全链路：击杀 BOSS → 宝箱 → 开箱 → 落库 + 推送（items + materials）
// ------------------------------------------------------------------

test("E20: full path — boss kill → chest → INTERACT open → inventory push (3-5 items) + materials +2", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  const roomId = "chest-room-a";
  bootChestRun({ roomId, seed: "chest-e2e-a", cs: svc });
  try {
    const { seatId } = await svc.begin({ userId: "u-chest-a", guest: false });
    const fc = fakeConn("u-chest-a");
    registerConnection(fc.conn);
    const world = getWorld(roomId)!;
    world.addPlayer(seatId, "u-chest-a");

    // 定位 BOSS（散布由 seed 决定），压血到 1 + 移到角落 + 玩家就位（技能射程内、接触外）。
    const boss = world.actors().find((a) => a.tier === 2)!;
    boss.x = 3 * TILE;
    boss.y = 3 * TILE;
    boss.hp = 1;
    boss.aggression = "passive";
    const p = world.actors().find((a) => a.ownerId === seatId)!;
    p.x = 3 * TILE + 60;
    p.y = 3 * TILE;

    // 击杀 BOSS（SKILL1 20dmg > 1hp）→ 宝箱刷出（run loop 自动 step）。
    runManagerEnqueue(roomId, seatId, { action: InputAction.SKILL1, dir: 0, skillSlot: 0 });
    await waitUntil(() => world.actors().some((a) => a.kind === EntityKind.CHEST), "宝箱刷出");
    const chest = world.actors().find((a) => a.kind === EntityKind.CHEST)!;

    // 开箱（INTERACT 目标宝箱）→ run loop consumeChestOpens → applyChestOpenToInventory 落库 + 推送。
    const p2 = world.actors().find((a) => a.ownerId === seatId)!;
    p2.x = chest.x;
    p2.y = chest.y;
    runManagerEnqueue(roomId, seatId, { action: InputAction.INTERACT, dir: 0, targetEntityId: chest.id });

    await waitUntil(
      async () => {
        const snap = await svc.loadOrCreate("u-chest-a");
        return snap.snapshot.inventory.items.length >= CHEST_ITEM_COUNT_MIN
          && (snap.snapshot.character.materials ?? 0) >= CHEST_STONES;
      },
      "开箱 3-5 件入库 + materials+2 落库",
    );

    const snap = await svc.loadOrCreate("u-chest-a");
    const added = snap.snapshot.inventory.items;
    assert.ok(added.length >= CHEST_ITEM_COUNT_MIN && added.length <= CHEST_ITEM_COUNT_MAX, `开箱入库 ${added.length} 件 ∈ [${CHEST_ITEM_COUNT_MIN},${CHEST_ITEM_COUNT_MAX}]`);
    assert.equal(added.filter((i) => i.rarity === 3).length, 1, "入库含恰 1 件暗金");
    assert.equal(snap.snapshot.character.materials, CHEST_STONES, "Character.materials +2 落库");
    // 推送：character.inventory 携带 items（≥3）+ materials=2（客户端一次拉全）。
    const push = invMsg(fc.sent);
    assert.ok(push, "开箱后应推送 character.inventory");
    assert.ok((push!.items ?? []).length >= CHEST_ITEM_COUNT_MIN, "推送携带多件装备");
    assert.equal(push!.materials, CHEST_STONES, "推送携带 materials=2");
    assert.ok(store.saveCount > 0, "开箱触发角色落库");
    // 宝箱实体消失。
    assert.ok(!world.actors().some((a) => a.kind === EntityKind.CHEST), "开箱后宝箱消失");
  } finally {
    stopRun(roomId);
    removeConnection("conn_0"); // 防御清理
  }
});

// ------------------------------------------------------------------
// ② 溢出（C-Per-3）：背包满 → 开箱溢出不入库 → 落回脚下地面
// ------------------------------------------------------------------

test("E20: overflow — full bag chest open → overflow items spawn ground loot (C-Per-3)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  const roomId = "chest-room-b";
  bootChestRun({ roomId, seed: "chest-e2e-b", cs: svc });
  try {
    // 预置满背包角色（60/60，C-Per-3 溢出边界）。
    const full: CharacterSnapshot = {
      ...createNewCharacter("u-chest-b"),
      inventory: {
        items: Array.from({ length: INVENTORY_CAP }, (_, i) => ({
          itemId: 1000 + i,
          rarity: 0,
          affixes: [],
        })),
      },
    };
    await store.save("u-chest-b", full);

    const { seatId } = await svc.begin({ userId: "u-chest-b", guest: false });
    const fc = fakeConn("u-chest-b");
    registerConnection(fc.conn);
    const world = getWorld(roomId)!;
    world.addPlayer(seatId, "u-chest-b");

    // 直接驱动开箱事件（3 件装备 + 2 石；仿 material-drop 直接驱动先例）→ 满背包 → 3 件全部溢出。
    const items = [
      { itemId: 910001, rarity: 3, affixes: [1, 2, 3, 4, 5] },
      { itemId: 910002, rarity: 2, affixes: [1, 2, 3] },
      { itemId: 910003, rarity: 1, affixes: [1, 2] },
    ];
    await applyChestOpenToInventory(svc, "u-chest-b", world, items, CHEST_STONES);

    const snap = await svc.loadOrCreate("u-chest-b");
    assert.equal(snap.snapshot.inventory.items.length, INVENTORY_CAP, "背包保持满（未超 cap）");
    assert.ok(!snap.snapshot.inventory.items.some((i) => i.itemId === 910001), "溢出物品不入库");
    // 溢出落回脚下地面（C-Per-3：地面出现溢出物品实体）。
    const grounds = world.actors().filter((a) => a.kind === EntityKind.LOOT_GROUND && [910001, 910002, 910003].includes(a.loot?.itemId ?? -1));
    assert.ok(grounds.length >= 1, "溢出物品 spawn 地面掉落");
    assert.ok(grounds.every((a) => a.loot!.ttlTicks === LOOT_GROUND_TTL_TICKS), "溢出掉落 ttl = LOOT_GROUND_TTL_TICKS");
    // 材料仍 +2（单次 save 原子：items 溢出不影响 materials 累加）。
    assert.equal(snap.snapshot.character.materials, CHEST_STONES, "溢出场景材料仍 +2 落库");
    const push = invMsg(fc.sent);
    assert.ok(push, "溢出开箱仍推送 character.inventory");
    assert.equal(push!.materials, CHEST_STONES, "推送携带 materials=2");
  } finally {
    stopRun(roomId);
    removeConnection("conn_0");
  }
});

// ------------------------------------------------------------------
// ③ 游客开箱 → 零持久写 + 不推送（C-Per-1）
// ------------------------------------------------------------------

test("E20: guest chest open → zero persistence + no push (C-Per-1)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  const roomId = "chest-room-c";
  bootChestRun({ roomId, seed: "chest-e2e-c", cs: svc });
  try {
    const { seatId } = await svc.begin({ userId: "guest_chest", guest: true });
    const fc = fakeConn("guest_chest");
    registerConnection(fc.conn);
    const world = getWorld(roomId)!;
    world.addPlayer(seatId, "guest_chest");

    // 杀 BOSS → 开箱（全链路；游客路径应被 handleChestOpen 拦截：零持久写 + 不推送）。
    const boss = world.actors().find((a) => a.tier === 2)!;
    boss.x = 3 * TILE;
    boss.y = 3 * TILE;
    boss.hp = 1;
    boss.aggression = "passive";
    const p = world.actors().find((a) => a.ownerId === seatId)!;
    p.x = 3 * TILE + 60;
    p.y = 3 * TILE;
    runManagerEnqueue(roomId, seatId, { action: InputAction.SKILL1, dir: 0, skillSlot: 0 });
    await waitUntil(() => world.actors().some((a) => a.kind === EntityKind.CHEST), "宝箱刷出");
    const chest = world.actors().find((a) => a.kind === EntityKind.CHEST)!;
    const p2 = world.actors().find((a) => a.ownerId === seatId)!;
    p2.x = chest.x;
    p2.y = chest.y;
    runManagerEnqueue(roomId, seatId, { action: InputAction.INTERACT, dir: 0, targetEntityId: chest.id });

    // 给 run loop 机会处理开箱事件（若错误触发落库/推送）。
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(store.saveCount, 0, "游客开箱不落库（C-Per-1）");
    assert.equal(store.loadCount, 0, "游客开箱不 loadOrCreate（C-Per-1）");
    assert.equal(await store.exists("guest_chest"), false, "无游客持久化记录");
    assert.equal(invMsg(fc.sent), undefined, "游客开箱不推送 character.inventory");
  } finally {
    stopRun(roomId);
    removeConnection("conn_0");
  }
});

/** 经 run-manager 入队输入（真实 12Hz loop 路径；seq 单调由 world.enqueueInput 强制）。 */
let seqCounter = 1;
function runManagerEnqueue(roomId: string, seatId: number, cmd: { action: number; dir: number; skillSlot?: number; targetEntityId?: number }): void {
  enqueueInput(roomId, seatId, { seq: seqCounter++, tick: 0, ...cmd } as InputCmd);
}
