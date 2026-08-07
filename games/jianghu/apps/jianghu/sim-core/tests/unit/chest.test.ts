/**
 * chest.test.ts — E20 BOSS 战利品宝箱（sim-core 确定性单测）
 * ===========================================================================
 * 覆盖（全部确定性断言，D9：无随机、无 Date.now）：
 *   ① BOSS 死亡 → 刷「战利品宝箱」实体（EntityKind.CHEST，显示暗金 rarity=3 + ttl=CHEST_TTL_TICKS）
 *   ② 宝箱不漂浮（位置稳定）+ 不自动拾取（玩家重叠不产生 pickup，宝箱保留）
 *   ③ 开箱（INTERACT 且在 CHEST_OPEN_RADIUS 内）→ ChestOpenEvent：3-5 件（恰 1 暗金 + 金/蓝）
 *      + 强化石×2（CHEST_STONES）→ 宝箱消失 + world 内部材料镜像 +2
 *   ④ 非重叠（超出 CHEST_OPEN_RADIUS）不可开箱（无事件、宝箱保留）
 *   ⑤ ttl 到期 → 宝箱消失（拾取前不消失）
 *   ⑥ 确定性：同 seed + 同输入 ⇒ 同开箱内容（D9）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction } from "../../src/types.ts";
import {
  TILE,
  ENEMY_BASE_HP,
  CHEST_TTL_TICKS,
  CHEST_OPEN_RADIUS,
  CHEST_STONES,
  CHEST_ITEM_COUNT_MIN,
  CHEST_ITEM_COUNT_MAX,
} from "../../src/constants.ts";

const PLAYER_X = 16 * TILE;
const PLAYER_Y = 15 * TILE;
const NEAR = { x: PLAYER_X, y: PLAYER_Y };

function mkBossWorld(seed: string): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed,
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    // BOSS passive（被打才反击）+ respawnTicks 极大（不复活，隔离宝箱判定）。
    spawnZones: [
      { pos: NEAR, tier: 2, enemyTypeId: "b", count: 1, respawnTicks: 100000, aggression: "passive" },
    ],
  });
}

function player(world: World, seat = 0) {
  return world.actors().find((a) => a.ownerId === seat)!;
}

function findChest(world: World) {
  return world.actors().find((a) => a.kind === EntityKind.CHEST);
}

/** 击杀 BOSS：先搬到角落（玩家 corner+80：SKILL4 射程 86 内、telegraph AOE 半径 72 外、接触 48 外，
 *  防 phase2 AOE 秒杀 + 被动反击干扰），SKILL4 连发（cd96，9 击 ≈ 769 tick）。
 *  seq 与后续 openChest 共用（C11 seq 单调：开箱 seq 必须 > 击杀 seq）。 */
function killBoss(world: World, seq: { s: number }, seat = 0): boolean {
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  boss.x = 3 * TILE;
  boss.y = 3 * TILE;
  boss.aggression = "passive";
  const p = player(world, seat);
  p.x = 3 * TILE + 80;
  p.y = 3 * TILE;
  for (let t = 0; t < 2000; t++) {
    if (boss.hp <= 0) return true;
    world.enqueueInput(seat, { seq: seq.s++, tick: world.tick, action: InputAction.SKILL4, dir: 0, skillSlot: 3 });
    world.step();
  }
  return !world.actors().some((a) => a.kind === EntityKind.BOSS);
}

/** 开箱（INTERACT 目标宝箱 id；默认把玩家放到宝箱旁确保在开箱半径内）。 */
function openChest(world: World, chestId: number, seq: { s: number }, seat = 0): void {
  const chest = world.actors().find((a) => a.id === chestId)!;
  const p = player(world, seat);
  p.x = chest.x;
  p.y = chest.y; // 距离 0 < CHEST_OPEN_RADIUS
  world.enqueueInput(seat, { seq: seq.s++, tick: world.tick, action: InputAction.INTERACT, dir: 0, targetEntityId: chestId });
  world.step();
}

// ─────────────────────────────────────────────────────────────
// ① BOSS 死亡 → 刷宝箱
// ─────────────────────────────────────────────────────────────

test("① BOSS 死亡 → 刷战利品宝箱（kind=CHEST，显示暗金 + ttl=CHEST_TTL_TICKS，无地面 token）", () => {
  const world = mkBossWorld("chest-spawn");
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  assert.equal(boss.hp, ENEMY_BASE_HP * 10, "BOSS hp = 30×10 = 300");
  const seq = { s: 0 };
  assert.ok(killBoss(world, seq), "BOSS 应被击杀");
  const chest = findChest(world);
  assert.ok(chest, "BOSS 死亡应刷出宝箱实体");
  assert.equal(chest!.kind, EntityKind.CHEST, "宝箱 kind = EntityKind.CHEST");
  assert.ok(chest!.loot, "宝箱持有 loot 字段（显示暗金 + ttl）");
  assert.equal(chest!.loot!.rarity, 3, "宝箱显示必含暗金（rarity=3，向玩家预告）");
  assert.equal(chest!.loot!.affixes.length, 5, "暗金恒 5 词缀");
  // 宝箱 ttl = CHEST_TTL_TICKS；死亡 tick 的 (6b) 段已递减 1（与 LOOT_GROUND 出生 tick 语义一致，
  // 见 world-combat「TTL 每 tick 递减」）→ 观测值 = CHEST_TTL_TICKS - 1。
  assert.equal(chest!.loot!.ttlTicks, CHEST_TTL_TICKS - 1, "宝箱 ttl = CHEST_TTL_TICKS（5min，出生 tick 已递减 1）");
  assert.equal(chest!.x, 3 * TILE, "宝箱刷在 BOSS 死亡位置 x");
  assert.equal(chest!.y, 3 * TILE, "宝箱刷在 BOSS 死亡位置 y");
  // BOSS 死亡不再直接掉地面 token（掉装仪式化进宝箱）。
  assert.equal(
    world.actors().filter((a) => a.kind === EntityKind.LOOT_GROUND).length,
    0,
    "BOSS 死亡不产生 LOOT_GROUND（掉装进宝箱）",
  );
});

// ─────────────────────────────────────────────────────────────
// ② 不漂浮 + 不自动拾取
// ─────────────────────────────────────────────────────────────

test("② 宝箱不漂浮 + 不自动拾取（玩家重叠不产生 pickup，宝箱保留）", () => {
  const world = mkBossWorld("chest-static");
  const seq = { s: 0 };
  assert.ok(killBoss(world, seq));
  const chest = findChest(world)!;
  const cx = chest.x;
  const cy = chest.y;
  const ttl0 = chest.loot!.ttlTicks;
  // 玩家放到宝箱上（距离 0 < PICKUP_RADIUS → 若是 LOOT_GROUND 会被自动拾取）。
  const p = player(world);
  p.x = cx;
  p.y = cy;
  for (let i = 0; i < 5; i++) world.step();
  const chest2 = findChest(world);
  assert.ok(chest2, "宝箱未被自动拾取（保留）");
  assert.equal(chest2!.x, cx, "宝箱不漂浮（x 不变）");
  assert.equal(chest2!.y, cy, "宝箱不漂浮（y 不变）");
  assert.equal(chest2!.loot!.ttlTicks, ttl0 - 5, "宝箱 ttl 每 tick 递减");
  assert.equal(world.consumePickups().length, 0, "宝箱不产生拾取事件");
});

// ─────────────────────────────────────────────────────────────
// ③ 开箱结算
// ─────────────────────────────────────────────────────────────

test("③ 开箱（INTERACT 在半径内）→ 3-5 件恰 1 暗金 + 金/蓝 + 强化石×2 → 宝箱消失", () => {
  const world = mkBossWorld("chest-open");
  const seq = { s: 0 };
  assert.ok(killBoss(world, seq));
  const chest = findChest(world)!;
  const chestId = chest.id;
  const materialsBefore = player(world).materials ?? 0;

  openChest(world, chestId, seq);

  // 事件缓冲：ChestOpenEvent{seatId, items, stones}
  const opens = world.consumeChestOpens();
  assert.equal(opens.length, 1, "开箱产生一次 ChestOpenEvent");
  const ev = opens[0];
  assert.equal(ev.seatId, 0, "事件携带 seatId=0");
  assert.equal(ev.stones, CHEST_STONES, "强化石×2（CHEST_STONES）");
  assert.ok(ev.items.length >= CHEST_ITEM_COUNT_MIN && ev.items.length <= CHEST_ITEM_COUNT_MAX, `件数 ${ev.items.length} ∈ [${CHEST_ITEM_COUNT_MIN},${CHEST_ITEM_COUNT_MAX}]`);
  const darkgoldCount = ev.items.filter((i) => i.rarity === 3).length;
  assert.equal(darkgoldCount, 1, "恰 1 件暗金（rarity=3）");
  for (const it of ev.items) {
    assert.ok(it.itemId >= 1, "itemId 合法");
    if (it.rarity !== 3) assert.ok(it.rarity === 1 || it.rarity === 2, "其余为金/蓝（rarity∈{1,2}）");
  }
  // 宝箱消失 + world 内部材料镜像 +2。
  assert.ok(!findChest(world), "开箱后宝箱消失");
  assert.equal((player(world).materials ?? 0), materialsBefore + CHEST_STONES, "world 材料镜像 +2");
  assert.equal(world.consumeChestOpens().length, 0, "消费后缓冲清空");
});

// ─────────────────────────────────────────────────────────────
// ④ 非重叠不可开
// ─────────────────────────────────────────────────────────────

test("④ 非重叠（超出 CHEST_OPEN_RADIUS）不可开箱 → 无事件、宝箱保留；走近后可开", () => {
  const world = mkBossWorld("chest-range");
  const seq = { s: 0 };
  assert.ok(killBoss(world, seq));
  const chest = findChest(world)!;
  const chestId = chest.id;
  // 玩家放远（> CHEST_OPEN_RADIUS），INTERACT 应被拒绝。
  const p = player(world);
  p.x = chest.x + CHEST_OPEN_RADIUS + 100;
  p.y = chest.y;
  world.enqueueInput(0, { seq: seq.s++, tick: world.tick, action: InputAction.INTERACT, dir: 0, targetEntityId: chestId });
  world.step();
  assert.equal(world.consumeChestOpens().length, 0, "超出开箱半径 → 无开箱事件");
  assert.ok(findChest(world), "宝箱保留");
  // 走近后（openChest 自动放到宝箱旁）→ 可开。
  openChest(world, chestId, seq);
  assert.equal(world.consumeChestOpens().length, 1, "走近后开箱成功");
  assert.ok(!findChest(world), "开箱后宝箱消失");
});

// ─────────────────────────────────────────────────────────────
// ⑤ ttl 到期消失
// ─────────────────────────────────────────────────────────────

test("⑤ ttl 到期 → 宝箱消失（拾取前不消失）", () => {
  const world = mkBossWorld("chest-ttl");
  const seq = { s: 0 };
  assert.ok(killBoss(world, seq));
  const chest = findChest(world)!;
  chest.loot!.ttlTicks = 2; // 直接压短 ttl（同 death.test 直接改 actor 先例），验证到期移除语义
  for (let i = 0; i < 3; i++) world.step(); // ttl 2→1→0→移除
  assert.ok(!findChest(world), "ttl 到期后宝箱消失");
});

// ─────────────────────────────────────────────────────────────
// ⑥ 确定性
// ─────────────────────────────────────────────────────────────

test("⑥ 确定性：同 seed + 同输入 ⇒ 同开箱内容（D9）", () => {
  const run = (): { items: { itemId: number; rarity: number; affixes: number[] }[]; stones: number } => {
    const world = mkBossWorld("chest-det");
    const seq = { s: 0 };
    assert.ok(killBoss(world, seq));
    const chest = findChest(world)!;
    openChest(world, chest.id, seq);
    const opens = world.consumeChestOpens();
    assert.equal(opens.length, 1);
    return {
      items: opens[0].items.map((i) => ({ itemId: i.itemId, rarity: i.rarity, affixes: [...i.affixes] })),
      stones: opens[0].stones,
    };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "同 seed + 同输入 ⇒ 开箱内容字节级一致（D9）");
});
