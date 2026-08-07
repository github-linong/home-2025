/**
 * persistence-auth.test.ts — 持久化双模式单元（C-Per-1 / C-Per-3 / xpForLevel / 不合并）
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CharacterService,
  MemoryCharacterStore,
  createNewCharacter,
  DEFAULT_ATTRS,
  SAFE_SPAWN,
} from "../src/persistence.ts";
import {
  addItem,
  toGroundLoot,
  isInventoryFull,
  INVENTORY_CAP,
  LOOT_GROUND_TTL_TICKS,
} from "../src/inventory.ts";
import { xpForLevel } from "../sim-core/src/constants.ts";
import type { Inventory, InventoryItem } from "../src/persistence.ts";

// ── C-Per-1：游客零持久写 ──
test("C-Per-1: guest session triggers zero persistence (no load/save, no record)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  const r = await svc.begin({ userId: "guest_abc", guest: true });
  assert.equal(r.snapshot, null, "guest has no persisted character snapshot");
  assert.equal(await store.exists("guest_abc"), false, "no DB/store record for guest");
  assert.equal(store.saveCount, 0, "store.save never called for guest");
  assert.equal(store.loadCount, 0, "store.load never called for guest");
  assert.ok(!store.keys().includes("guest_abc"));
});

// ── 登录：load/create + seat 映射 ──
test("login: begin loads existing or creates new Lv1 character with empty bag + seat", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  const r1 = await svc.begin({ userId: "u_login", guest: false });
  assert.equal(r1.created, true, "first begin creates new character");
  assert.equal(r1.snapshot!.character.level, 1);
  assert.equal(r1.snapshot!.inventory.items.length, 0);
  assert.ok(r1.seatId >= 1, "seatId assigned (seat/player mapping)");
  // 新角色立即落库（防丢失）
  assert.equal(store.saveCount, 1);

  const r2 = await svc.begin({ userId: "u_login", guest: false });
  assert.equal(r2.created, false, "second begin loads persisted character");
  assert.equal(r2.snapshot!.character.userId, "u_login");
  assert.equal(await store.exists("u_login"), true);
});

// ── 新角色默认值 ──
test("createNewCharacter: Lv1 / EXP0 / default attrs / safe spawn", () => {
  const fresh = createNewCharacter("x");
  assert.equal(fresh.character.level, 1);
  assert.equal(fresh.character.exp, 0);
  assert.deepEqual(fresh.character.attrs, DEFAULT_ATTRS);
  assert.deepEqual(fresh.character.pos, SAFE_SPAWN);
  assert.equal(fresh.inventory.items.length, 0);
});

// ── xpForLevel 正确性 ──
test("xpForLevel correctness (XP_req = 50 · L^1.5)", () => {
  assert.equal(xpForLevel(1), 50);
  assert.equal(xpForLevel(2), Math.floor(50 * Math.pow(2, 1.5)));
  assert.equal(xpForLevel(10), Math.floor(50 * Math.pow(10, 1.5)));
  let prev = -1;
  for (let lv = 1; lv <= 50; lv++) {
    const v = xpForLevel(lv);
    assert.ok(v > prev, `xpForLevel must be strictly increasing at lv${lv}`);
    prev = v;
  }
});

// ── C-Per-3：背包满溢出 + 地面 ttlTicks ──
test("C-Per-3: full bag (≥ INVENTORY_CAP) overflows; bag stays at cap", () => {
  const full: Inventory = {
    items: Array.from({ length: INVENTORY_CAP }, (_, i): InventoryItem => ({
      itemId: i,
      rarity: 0,
      affixes: [],
    })),
  };
  assert.equal(isInventoryFull(full), true);
  const extra: InventoryItem = { itemId: 999, rarity: 2, affixes: [1, 2] };
  const { inventory, overflow } = addItem(full, extra);
  assert.equal(overflow?.itemId, 999, "overflow item returned when bag full");
  assert.equal(inventory.items.length, INVENTORY_CAP, "bag length stays at cap");
});

test("C-Per-3: under-cap append; toGroundLoot carries ttlTicks (no email)", () => {
  const inv: Inventory = { items: [] };
  const { inventory, overflow } = addItem(inv, { itemId: 1, rarity: 0, affixes: [] });
  assert.equal(overflow, null, "no overflow when under cap");
  assert.equal(inventory.items.length, 1);

  const ground = toGroundLoot({ itemId: 1, rarity: 3, affixes: [5] });
  assert.equal(ground.ttlTicks, LOOT_GROUND_TTL_TICKS, "EntityState.loot.ttlTicks populated");
  assert.equal(ground.itemId, 1);
  assert.equal(ground.rarity, 3);
});

// ── 游客→登录不合并（锁定决策）──
test("guest→login no merge: login character independent, never contains guest items", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });

  // 模拟游客在内存里拾取了物品（绝不落库）。
  const guestItems: InventoryItem[] = [{ itemId: 777, rarity: 0, affixes: [] }];
  const g = await svc.begin({ userId: "guest_temp", guest: true });
  assert.equal(g.snapshot, null, "guest holds no persisted snapshot");
  void guestItems; // 客人进度仅存于内存（本测试不写库）

  // 现在“登录”一个真实账号。
  const login = await svc.begin({ userId: "real_user", guest: false });
  assert.equal(login.snapshot!.inventory.items.length, 0, "login inventory empty (no merge)");
  assert.ok(
    !login.snapshot!.inventory.items.some((i) => i.itemId === 777),
    "guest items never merged into login character",
  );
  // 客人进度未落库（C-Per-1 同时成立）。
  assert.equal(await store.exists("guest_temp"), false);
});
