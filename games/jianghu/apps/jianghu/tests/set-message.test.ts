/**
 * set-message.test.ts — E32 套装消息（控制面 character.inventory 带 setId + 穿戴回推 + 掉落映射）
 * ===========================================================================
 * 覆盖（无真实 ws / DB；MemoryCharacterStore in-memory fake，复用既有测试模式）：
 *   - character.inventory 消息 items/equipped 带 setId；
 *   - 穿戴套装回推：resolveEquip 把 setId 从背包迁到 equipped 视图 + 落库；
 *   - 掉落→背包 setId 映射：石牢(biome1)拾取→铁骨、荒冢(biome2)拾取→鬼影、
 *     主题副本 BOSS 宝箱→烈阳；biome0 → 无套装（golden 不变）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CharacterService,
  MemoryCharacterStore,
  createNewCharacter,
  type CharacterSnapshot,
} from "../src/persistence.ts";
import {
  setProtocolCharacterService,
  resolveInventoryGet,
  resolveEquip,
  type ProtocolContext,
  type InventoryMessage,
} from "../src/protocol.ts";
import {
  applyPickupToInventory,
  applyChestOpenToInventory,
} from "../src/run-manager.ts";
import { createWorld } from "../sim-core/src/world.ts";
import { RoomPhase } from "../sim-core/src/types.ts";
import { computeEquipStats } from "../sim-core/src/affixes.ts";
import {
  BIOME_DEFAULT,
  BIOME_STONE_PRISON,
  BIOME_BARROW,
  SET_IRONBONE,
  SET_WRAITH,
  SET_BLAZING_SUN,
} from "../sim-core/src/constants.ts";

function mkWorld(biomeId: number) {
  return createWorld({
    runId: "r",
    roomId: "rm-set",
    seed: "set-" + biomeId,
    phase: RoomPhase.DUNGEON,
    lootTokens: 0,
    biomeId,
  });
}

// ------------------------------------------------------------------
// ① character.inventory 消息带 setId（items + equipped）
// ------------------------------------------------------------------

test("character.inventory 消息带 setId（items + equipped）", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  const base = createNewCharacter("u-set-msg");
  const snap: CharacterSnapshot = {
    character: {
      ...base.character,
      equipped: {
        weapon: { itemId: 3, rarity: 0, affixes: [], setId: SET_IRONBONE },
        armor: { itemId: 4, rarity: 0, affixes: [], setId: SET_IRONBONE },
      },
    },
    inventory: {
      items: [{ itemId: 5, rarity: 0, affixes: [], slot: "trinket", setId: SET_IRONBONE }],
    },
  };
  await svc.save("u-set-msg", snap);
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "u-set-msg", guest: false });
    const ctx: ProtocolContext = { userId: "u-set-msg", connId: "c", seatId, roomId: null };
    const reply = await resolveInventoryGet(ctx, { type: "character.inventory.get", requestId: "s1" });

    assert.equal(reply.items.length, 1);
    assert.equal(reply.items[0].setId, SET_IRONBONE, "背包物品视图带 setId");
    assert.equal(reply.equipped.weapon!.setId, SET_IRONBONE, "已穿戴武器视图带 setId");
    assert.equal(reply.equipped.armor!.setId, SET_IRONBONE, "已穿戴护甲视图带 setId");
  } finally {
    setProtocolCharacterService(null);
  }
});

// ------------------------------------------------------------------
// ② 穿戴套装回推：resolveEquip 保留 setId 迁入 equipped
// ------------------------------------------------------------------

test("穿戴套装回推：resolveEquip 把 setId 从背包迁到 equipped + 落库", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  const base = createNewCharacter("u-set-equip");
  await svc.save("u-set-equip", {
    character: {
      ...base.character,
      equipped: {
        weapon: { itemId: 3, rarity: 0, affixes: [], setId: SET_WRAITH },
        armor: { itemId: 4, rarity: 0, affixes: [], setId: SET_WRAITH },
      },
    },
    inventory: {
      items: [{ itemId: 5, rarity: 0, affixes: [], slot: "trinket", setId: SET_WRAITH }],
    },
  });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "u-set-equip", guest: false });
    const ctx: ProtocolContext = { userId: "u-set-equip", connId: "c", seatId, roomId: null };
    const reply = (await resolveEquip(ctx, {
      type: "character.equip",
      requestId: "eq-set",
      payload: { itemId: 5 },
    })) as InventoryMessage;

    assert.equal(reply.equipped.trinket!.setId, SET_WRAITH, "回推 equipped.trinket 带 setId");
    assert.ok(!reply.items.some((i) => i.itemId === 5), "已装备物品移出背包");
    // 持久化：equipped 保留 setId。
    const { snapshot } = await svc.loadOrCreate("u-set-equip");
    assert.equal(snapshot.character.equipped!.trinket!.setId, SET_WRAITH, "持久化 equipped.trinket.setId 落库");
    // 穿满 3 件 → 套装加成在 computeEquipStats 生效（鬼影 3 件 attackSpeed=13%、moveSpeed=12%）。
    const stats = computeEquipStats(snapshot.character.equipped);
    assert.equal(stats.attackSpeed, 0.13, "鬼影 3 件 attackSpeed = 8%+5% = 13%");
    assert.equal(stats.moveSpeed, 0.12, "鬼影 3 件 moveSpeed = 12%");
  } finally {
    setProtocolCharacterService(null);
  }
});

// ------------------------------------------------------------------
// ③ 掉落→背包 setId 映射（拾取：石牢→铁骨、荒冢→鬼影、biome0→无）
// ------------------------------------------------------------------

test("掉落→背包 setId：石牢(biome1)拾取→铁骨、荒冢(biome2)拾取→鬼影、biome0→无套装", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });

  await applyPickupToInventory(svc, "u-set-pick1", mkWorld(BIOME_STONE_PRISON), { itemId: 100, rarity: 2, affixes: [1] });
  await applyPickupToInventory(svc, "u-set-pick2", mkWorld(BIOME_BARROW), { itemId: 101, rarity: 2, affixes: [2] });
  await applyPickupToInventory(svc, "u-set-pick0", mkWorld(BIOME_DEFAULT), { itemId: 102, rarity: 2, affixes: [3] });

  const s1 = await svc.loadOrCreate("u-set-pick1");
  const s2 = await svc.loadOrCreate("u-set-pick2");
  const s0 = await svc.loadOrCreate("u-set-pick0");
  assert.equal(s1.snapshot.inventory.items[0].setId, SET_IRONBONE, "石牢拾取 → 铁骨");
  assert.equal(s2.snapshot.inventory.items[0].setId, SET_WRAITH, "荒冢拾取 → 鬼影");
  assert.equal(s0.snapshot.inventory.items[0].setId, undefined, "biome0 拾取 → 无套装（golden 不变）");
});

// ------------------------------------------------------------------
// ④ BOSS 宝箱→背包 setId 映射（主题副本→烈阳、biome0→无）
// ------------------------------------------------------------------

test("BOSS 宝箱→背包 setId：主题副本(biome1/2)开箱→烈阳、biome0→无套装", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });

  await applyChestOpenToInventory(svc, "u-set-chest1", mkWorld(BIOME_STONE_PRISON), [{ itemId: 200, rarity: 3, affixes: [1, 2, 3, 4, 5] }], 2);
  await applyChestOpenToInventory(svc, "u-set-chest2", mkWorld(BIOME_BARROW), [{ itemId: 201, rarity: 3, affixes: [1, 2, 3, 4, 5] }], 2);
  await applyChestOpenToInventory(svc, "u-set-chest0", mkWorld(BIOME_DEFAULT), [{ itemId: 202, rarity: 2, affixes: [1] }], 2);

  const s1 = await svc.loadOrCreate("u-set-chest1");
  const s2 = await svc.loadOrCreate("u-set-chest2");
  const s0 = await svc.loadOrCreate("u-set-chest0");
  assert.equal(s1.snapshot.inventory.items[0].setId, SET_BLAZING_SUN, "石牢 BOSS 宝箱 → 烈阳");
  assert.equal(s2.snapshot.inventory.items[0].setId, SET_BLAZING_SUN, "荒冢 BOSS 宝箱 → 烈阳");
  assert.equal(s0.snapshot.inventory.items[0].setId, undefined, "biome0 BOSS 宝箱 → 无套装（golden 不变）");
});
