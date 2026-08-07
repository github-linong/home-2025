/**
 * inventory-message.test.ts — E6 背包数据通道（控制面 character.inventory）
 * ===========================================================================
 * 覆盖：
 *   - 拾取入库成功（onPickup → applyPickupToInventory 路径）→ 向该 seat 连接推送
 *     `character.inventory`（fake conn spy 断言收到 items + cap）；
 *   - `character.inventory.get`（登录）→ 返回持久化背包（同一消息格式）；
 *   - `character.inventory.get`（游客）→ 空 items（C-Per-1 零持久写不涉及）。
 *
 * 无真实 ws / DB；MemoryCharacterStore in-memory fake + connection-registry fake Conn，
 * 复用 pickup-inventory / instance-lifecycle 测试模式。
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
} from "../src/persistence.ts";
import {
  registerConnection,
  removeConnection,
  type Conn,
} from "../src/connection-registry.ts";
import { setProtocolCharacterService, resolveInventoryGet, type ProtocolContext } from "../src/protocol.ts";
import { INVENTORY_CAP, LOOT_GROUND_TTL_TICKS } from "../sim-core/src/constants.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";

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
  cond: () => boolean,
  what: string,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout waiting for: ${what}`);
}

// ------------------------------------------------------------------
// ① 拾取入库成功 → character.inventory 推送（fake conn spy）
// ------------------------------------------------------------------

test("E6: login pickup persists → pushes character.inventory to seat connection", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  bootResidentRun();
  try {
    const { seatId } = await svc.begin({ userId: "u-inv-push", guest: false });
    const world = getWorld(RESIDENT_ROOM_ID)!;
    world.addPlayer(seatId, "u-inv-push");

    // 连接 spy：拾取入库成功后，控制面应收到 character.inventory。
    const fc = fakeConn("u-inv-push");
    registerConnection(fc.conn);

    // 玩家脚下生成地面掉落 → 下一 tick 拾取 → applyPickupToInventory 入库 → 推送。
    world.spawnGroundLoot(seatId, {
      itemId: 424242,
      rarity: 2,
      affixes: [1, 2],
      ttlTicks: LOOT_GROUND_TTL_TICKS,
    });

    await waitUntil(
      () => fc.sent.some((m) => (m as { type?: string }).type === "character.inventory"),
      "character.inventory push after pickup",
    );

    const push = fc.sent.find((m) => (m as { type?: string }).type === "character.inventory") as {
      type: string;
      items: { itemId: number; rarity: number; affixes: number[] }[];
      cap: number;
    };
    assert.equal(push.cap, INVENTORY_CAP, "cap 来自 C7 单一来源 INVENTORY_CAP=60");
    assert.ok(
      push.items.some((i) => i.itemId === 424242 && i.rarity === 2 && i.affixes.length === 2),
      "推送背包包含刚拾取的物品（itemId/rarity/affixes）",
    );
    // 入库确实落库（C-Per-3 闭环仍成立）。
    const snap = await svc.loadOrCreate("u-inv-push");
    assert.ok(snap.snapshot.inventory.items.some((i) => i.itemId === 424242), "pickup persisted to bag");
  } finally {
    stopRun(RESIDENT_ROOM_ID);
  }
});

// ------------------------------------------------------------------
// ② character.inventory.get（登录）→ 返回持久化背包
// ------------------------------------------------------------------

test("E6: character.inventory.get (login) returns persisted bag", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "u-inv-get", guest: false });
    // 预置背包：一个物品 itemId=777（gold 2 affixes）。
    const base = createNewCharacter("u-inv-get");
    await svc.save("u-inv-get", {
      character: base.character,
      inventory: { items: [{ itemId: 777, rarity: 2, affixes: [3, 8] }] },
    });

    const ctx: ProtocolContext = { userId: "u-inv-get", connId: "c-get", seatId, roomId: null };
    const reply = await resolveInventoryGet(ctx, { type: "character.inventory.get", requestId: "g1" });

    assert.equal(reply.type, "character.inventory");
    assert.equal(reply.requestId, "g1", "回复携带 requestId 供客户端关联");
    assert.equal(reply.cap, INVENTORY_CAP);
    assert.equal(reply.items.length, 1);
    assert.deepEqual(
      { ...reply.items[0] },
      { itemId: 777, rarity: 2, affixes: [3, 8] },
      "返回与持久化背包一致（itemId/rarity/affixes）",
    );
  } finally {
    // 无 run 循环，仅清理连接注册（如有）。
  }
});

// ------------------------------------------------------------------
// ③ character.inventory.get（游客）→ 空 items（C-Per-1 零持久写）
// ------------------------------------------------------------------

test("E6: character.inventory.get (guest) returns empty items (C-Per-1)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "guest_abc", guest: true });
    const ctx: ProtocolContext = { userId: "guest_abc", connId: "c-guest", seatId, roomId: null };
    const reply = await resolveInventoryGet(ctx, { type: "character.inventory.get", requestId: "g2" });

    assert.equal(reply.type, "character.inventory");
    assert.deepEqual(reply.items, [], "游客回空 items（C-Per-1 零持久写不涉及）");
    assert.equal(reply.cap, INVENTORY_CAP);
    // 游客零持久写：store 无任何记录。
    assert.equal(store.saveCount, 0, "guest get 不触发 save");
    assert.equal(store.loadCount, 0, "guest get 不触发 load（不 loadOrCreate 游客）");
    assert.equal(await store.exists("guest_abc"), false, "无游客持久化记录");
  } finally {
    // 无 run 循环。
  }
});
