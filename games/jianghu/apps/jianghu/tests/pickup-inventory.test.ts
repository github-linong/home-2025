/**
 * pickup-inventory.test.ts — F1（P1）拾取→背包生产接线（C-Per-3 闭环）
 * ===========================================================================
 * 背景（QA 报告 F1）：`applyPickupToInventory` 曾无任何生产调用点 —— bootResidentRun /
 * enterInstance 的 startRun 均未传 `onPickup`，真实服务器拾取不落背包。
 *
 * 本测试覆盖修复后的生产路径（无真实 ws / DB；MemoryCharacterStore 为 in-memory fake store，
 * 复用现有测试模式）：
 *   - 登录玩家：bootResidentRun（默认 onPickup 接线）→ world 产生拾取 → onTick 经
 *     consumePickups 消费 → applyPickupToInventory 落库（背包增加，addItem 生效）；
 *   - 溢出场景：背包已满（≥ INVENTORY_CAP）→ 拾取溢出不入库 → world.spawnGroundLoot
 *     落回脚下（C-Per-3，地面出现溢出物品实体）；
 *   - 游客：零持久写（C-Per-1）—— guest seat 拾取 → store 无任何 load / save / 记录。
 *
 * 说明：溢出测试选 itemId 999999 / 424242（超出 RESIDENT 环境 token 区间 1000..9999），
 * 避免与占位漂浮掉落混淆，断言无歧义。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  bootResidentRun,
  stopRun,
  getWorld,
  setActiveCharacterService,
} from "../src/run-manager.ts";
import {
  CharacterService,
  MemoryCharacterStore,
  createNewCharacter,
  type CharacterSnapshot,
} from "../src/persistence.ts";
import { INVENTORY_CAP, LOOT_GROUND_TTL_TICKS } from "../src/inventory.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { EntityKind } from "../sim-core/src/types.ts";

/** 轮询等待（异步条件；用于 12Hz 循环驱动的端到端断言，抗慢 CI）。 */
async function waitUntil(
  cond: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout waiting for: ${what}`);
}

// ------------------------------------------------------------------
// F1 生产接线：登录玩家拾取 → 背包入库
// ------------------------------------------------------------------

test("F1: login pickup flows into inventory via bootResidentRun onPickup wiring", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId: "u-pickup", guest: false });
    const world = getWorld(RESIDENT_ROOM_ID)!;
    world.addPlayer(seatId, "u-pickup");
    // 玩家脚下生成地面掉落（距离 0 < PICKUP_RADIUS → 下一 tick 拾取）。
    world.spawnGroundLoot(seatId, {
      itemId: 424242,
      rarity: 2,
      affixes: [1, 2],
      ttlTicks: LOOT_GROUND_TTL_TICKS,
    });

    // 端到端：onTick consumePickups → onPickup（默认 handlePickup）→ applyPickupToInventory → addItem 落库。
    await waitUntil(
      async () => (await svc.loadOrCreate("u-pickup")).snapshot.inventory.items.some((i) => i.itemId === 424242),
      "item 424242 to be saved into login inventory",
    );

    const snap = await svc.loadOrCreate("u-pickup");
    const item = snap.snapshot.inventory.items.find((i) => i.itemId === 424242)!;
    assert.equal(item.rarity, 2, "addItem preserved rarity");
    assert.deepEqual([...item.affixes], [1, 2], "addItem preserved affixes");
    assert.ok(store.saveCount > 0, "pickup triggered a character save (落库)");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
  }
});

// ------------------------------------------------------------------
// F1 溢出场景（C-Per-3）：背包满 → 溢出物品落回脚下地面
// ------------------------------------------------------------------

test("F1: overflow (bag ≥ INVENTORY_CAP) stays out of bag and spawns ground loot (C-Per-3)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  bootResidentRun();
  try {
    // 预置满背包角色（60/60，C-Per-3 溢出边界）。
    const full: CharacterSnapshot = {
      ...createNewCharacter("u-overflow"),
      inventory: {
        items: Array.from({ length: INVENTORY_CAP }, (_, i) => ({
          itemId: i,
          rarity: 0,
          affixes: [],
        })),
      },
    };
    await store.save("u-overflow", full);

    const { seatId } = await svc.begin({ userId: "u-overflow", guest: false });
    const world = getWorld(RESIDENT_ROOM_ID)!;
    world.addPlayer(seatId, "u-overflow");
    world.spawnGroundLoot(seatId, {
      itemId: 999999,
      rarity: 3,
      affixes: [7, 8],
      ttlTicks: LOOT_GROUND_TTL_TICKS,
    });

    // 记录测试自身 spawn 的掉落 actor id：后续断言它被拾取消费、并由溢出路径 re-spawn 新实体
    // （nextId 单调 ⇒ 新实体 id 必不同），避免「测试 spawn 即满足」的假阳性。
    const initial = world
      .actors()
      .find((a) => a.kind === EntityKind.LOOT_GROUND && a.loot?.itemId === 999999)!;
    const initialId = initial.id;

    // 端到端溢出闭环（C-Per-3）：原掉落被拾取（id 消失）→ 背包满 → applyPickupToInventory
    // 溢出 → world.spawnGroundLoot 落回脚下（出现新 id 的 999999 地面实体）。
    await waitUntil(
      () => {
        const grounds = world
          .actors()
          .filter((a) => a.kind === EntityKind.LOOT_GROUND && a.loot?.itemId === 999999);
        return (
          !world.actors().some((a) => a.id === initialId) && // 原掉落已被拾取消费
          grounds.length > 0 &&
          grounds.every((a) => a.id !== initialId) // 溢出 re-spawn 出新实体
        );
      },
      "overflow item 999999 re-spawned to ground (new actor)",
    );

    const snap = await svc.loadOrCreate("u-overflow");
    assert.equal(snap.snapshot.inventory.items.length, INVENTORY_CAP, "bag stays at cap");
    assert.ok(
      !snap.snapshot.inventory.items.some((i) => i.itemId === 999999),
      "overflow item never enters bag",
    );
    assert.ok(store.saveCount > 0, "overflow pickup triggered a character save (落库)");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
  }
});

// ------------------------------------------------------------------
// F1 游客零持久写（C-Per-1）：guest seat 拾取 → 零 load / save / 记录
// ------------------------------------------------------------------

test("F1: guest pickup triggers zero persistence (C-Per-1)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId: "guest_zzz", guest: true });
    const world = getWorld(RESIDENT_ROOM_ID)!;
    world.addPlayer(seatId, "guest_zzz");
    world.spawnGroundLoot(seatId, {
      itemId: 777777,
      rarity: 1,
      affixes: [],
      ttlTicks: LOOT_GROUND_TTL_TICKS,
    });

    // 等若干 12Hz tick 让拾取发生（拾取 → handlePickup → getSeatInfo 判 guest → 忽略）。
    await new Promise((r) => setTimeout(r, 350));

    assert.equal(store.saveCount, 0, "guest pickup never saves (C-Per-1)");
    assert.equal(store.loadCount, 0, "guest pickup never loads (C-Per-1)");
    assert.equal(await store.exists("guest_zzz"), false, "no store record for guest");
    assert.ok(!store.keys().includes("guest_zzz"), "guest id absent from store");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
  }
});
