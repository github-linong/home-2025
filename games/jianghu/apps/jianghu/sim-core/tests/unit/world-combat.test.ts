/**
 * world-combat.test.ts — E4 联调集成测试（刷怪 + 战斗 + 掉装 + 拾取 + 复活 + BOSS 阶段）
 * ===========================================================================
 * 确定性（固定 seed + 固定输入序列），覆盖：
 *   - 刷怪区实例化敌人（tier/hp/kind/pos）
 *   - 无刷怪区 + 无玩家时 E4 逻辑空转（golden 安全）
 *   - 敌人→玩家接触伤害（无 parry 全额 / 有 parry 减伤 0.6）
 *   - 技能 CD 闸门（冷却中二次释放被拦截）
 *   - 玩家 SKILL 击杀 BOSS → 必掉 LOOT_GROUND 于尸体位置
 *   - 刷怪区清空 → 按 respawnTicks 复活
 *   - BOSS 血量跨阈值 → 进入 phase 2
 *   - 地面掉落 TTL 倒计时 / ttl=0 移除 / 玩家重叠拾取（钩子）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase, InputAction } from "../../src/types.ts";
import { TILE, ENEMY_BASE_HP, ENEMY_WINDUP_TICKS, LOOT_GROUND_TTL_TICKS } from "../../src/constants.ts";

const PLAYER_X = 16 * TILE; // 768
const PLAYER_Y = 15 * TILE; // 720
// 刷怪点设在玩家位置：敌人仅 ±SPAWN_SCATTER_PX 散布，seed17 下偏移≈12px，恒在
// 接触(48)/技能(72)范围内（确定性，避免散布把敌人推到范围外）。
const NEAR = { x: PLAYER_X, y: PLAYER_Y };
const PROX_SEED = "seed17";

const SKILL_ACTIONS = [InputAction.SKILL1, InputAction.SKILL2, InputAction.SKILL3, InputAction.SKILL4];

function mkWorld(opts: {
  seed?: string;
  players?: { seatId: number; userId: string }[];
  spawnZones?: Parameters<typeof createWorld>[0]["spawnZones"];
  lootTokens?: number;
}): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "E4-INTEG",
    phase: RoomPhase.OVERWORLD,
    players: opts.players,
    spawnZones: opts.spawnZones,
    lootTokens: opts.lootTokens ?? 0,
  });
}

function issueSkill(world: World, seat: number, slot: number, seq: { s: number }) {
  world.enqueueInput(seat, {
    seq: seq.s++,
    tick: world.tick,
    action: SKILL_ACTIONS[slot],
    dir: 0,
    skillSlot: slot,
  });
}

function findEnemy(world: World, kind: number) {
  return world.actors().find((a) => a.kind === kind);
}

// ─────────────────────────────────────────────────────────────
test("刷怪：spawnZone 实例化敌人（tier/hp/kind/pos 散布）", () => {
  const world = mkWorld({
    seed: "spawn",
    spawnZones: [
      { pos: { x: 100, y: 100 }, tier: 0, enemyTypeId: "n", count: 1 },
      { pos: { x: 200, y: 200 }, tier: 1, enemyTypeId: "e", count: 1 },
      { pos: { x: 300, y: 300 }, tier: 2, enemyTypeId: "b", count: 1 },
    ],
  });
  const enemies = world.actors().filter((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
  assert.equal(enemies.length, 3);
  const normal = enemies.find((e) => e.tier === 0)!;
  const elite = enemies.find((e) => e.tier === 1)!;
  const boss = enemies.find((e) => e.tier === 2)!;
  assert.equal(normal.hp, ENEMY_BASE_HP);
  assert.equal(normal.kind, EntityKind.ENEMY);
  assert.equal(elite.hp, ENEMY_BASE_HP * 3);
  assert.equal(elite.kind, EntityKind.ENEMY);
  assert.equal(boss.hp, ENEMY_BASE_HP * 10);
  assert.equal(boss.kind, EntityKind.BOSS);
  // pos 在刷怪点附近（散布 ≤ TILE）
  assert.ok(Math.abs(normal.x - 100) <= TILE);
  assert.ok(Math.abs(normal.y - 100) <= TILE);
});

test("空转：无刷怪区 + 无玩家 ⇒ 无敌人/玩家（golden 安全）", () => {
  const world = mkWorld({ seed: "inert", lootTokens: 4 });
  const kinds = world.actors().map((a) => a.kind);
  assert.ok(!kinds.includes(EntityKind.ENEMY));
  assert.ok(!kinds.includes(EntityKind.BOSS));
  assert.ok(!kinds.includes(EntityKind.PLAYER));
  assert.equal(kinds.filter((k) => k === EntityKind.ENTRANCE).length, 1);
  assert.equal(kinds.filter((k) => k === EntityKind.LOOT_GROUND).length, 4);
});

test("战斗：敌人接触伤害（无 parry）全额扣血（E18：前摇 ENEMY_WINDUP_TICKS 后落刀）", () => {
  const world = mkWorld({
    seed: PROX_SEED,
    players: [{ seatId: 0, userId: "u0" }],
    // E6：tier 0 默认 passive（不主动攻击）；此处显式 aggressive 验证接触攻击原语义。
    spawnZones: [{ pos: NEAR, tier: 0, enemyTypeId: "n", count: 1, aggression: "aggressive" }],
  });
  world.step(); // t=0 敌人进入前摇（WINDUP），伤害未结算
  const p0 = world.actors().find((a) => a.kind === EntityKind.PLAYER)!;
  assert.equal(p0.hp, 100, "前摇期间不结算伤害（可读可躲）");
  // 再走 ENEMY_WINDUP_TICKS tick → t=ENEMY_WINDUP_TICKS 落刀（前摇结束）。
  for (let i = 0; i < ENEMY_WINDUP_TICKS; i++) world.step();
  const player = world.actors().find((a) => a.kind === EntityKind.PLAYER)!;
  assert.equal(player.hp, 100 - 8, "无格挡前摇后落刀全额扣 8");
});

test("战斗：parry 覆盖 → 接触伤害减伤 0.6（8 → 3）（E18：读前摇、在落刀 tick 前开格挡）", () => {
  const world = mkWorld({
    seed: PROX_SEED,
    players: [{ seatId: 0, userId: "u0" }],
    // E6：tier 0 默认 passive；显式 aggressive 保持 E4 接触攻击原语义。
    spawnZones: [{ pos: NEAR, tier: 0, enemyTypeId: "n", count: 1, aggression: "aggressive" }],
  });
  // 前摇 5 tick（t=0..4），落刀在 t=5：玩家在 t=4 开格挡（窗口 t=4..6）→ 覆盖 t=5 落刀。
  for (let i = 0; i < ENEMY_WINDUP_TICKS - 1; i++) world.step(); // t=0..3（敌人站立蓄力）
  world.enqueueInput(0, { seq: 0, tick: 4, action: InputAction.PARRY, dir: 0 });
  world.step(); // t=4 开格挡窗口（windowEndTick=6）
  world.step(); // t=5 落刀 → 格挡覆盖 → round(8*0.4)=3
  const player = world.actors().find((a) => a.kind === EntityKind.PLAYER)!;
  assert.equal(player.hp, 100 - 3, "格挡覆盖应减伤 60%（round(8*0.4)=3）");
});

test("战斗：技能 CD 闸门（冷却中二次释放被拦截）", () => {
  const world = mkWorld({
    seed: PROX_SEED,
    players: [{ seatId: 0, userId: "u0" }],
    spawnZones: [{ pos: NEAR, tier: 0, enemyTypeId: "n", count: 1 }],
  });
  const enemy = findEnemy(world, EntityKind.ENEMY)!;
  const seq = { s: 0 };
  issueSkill(world, 0, 0, seq); // 槽0 dmg20 → 30-20=10
  world.step();
  assert.equal(enemy.hp, 10, "首次技能命中");
  issueSkill(world, 0, 0, seq); // 冷却中（cd=36）→ 拦截
  world.step();
  assert.equal(enemy.hp, 10, "冷却中技能不得造成伤害");
});

test("掉装：玩家 SKILL 击杀 BOSS → 刷战利品宝箱（E20）并开箱结算", () => {
  const world = mkWorld({
    seed: PROX_SEED,
    players: [{ seatId: 0, userId: "u0" }],
    // respawnTicks 设极大，避免死亡后复活干扰「已击杀」判定。
    spawnZones: [{ pos: NEAR, tier: 2, enemyTypeId: "b", count: 1, respawnTicks: 100000 }],
  });
  const seq = { s: 0 };
  let killed = false;
  for (let i = 0; i < 1500; i++) {
    const boss = findEnemy(world, EntityKind.BOSS);
    if (!boss) {
      killed = true;
      break;
    }
    issueSkill(world, 0, 3, seq); // 槽3 dmg36，cd96 → 约 9 击杀
    world.step();
  }
  assert.ok(killed, "BOSS 应在 maxTicks 内被击杀");
  // E20：BOSS 死亡不再直接掉地面 token，而是刷「战利品宝箱」（kind=CHEST）。
  const chest = world.actors().find((a) => a.kind === EntityKind.CHEST);
  assert.ok(chest, "BOSS 死亡应刷出宝箱实体");
  assert.ok(chest!.loot && chest!.loot.rarity === 3, "宝箱显示暗金（rarity=3）");
  // 开箱（INTERACT 目标宝箱）→ ChestOpenEvent（3-5 件恰 1 暗金 + 金/蓝 + 强化石×2）。
  const p = world.actors().find((a) => a.ownerId === 0)!;
  p.x = chest!.x;
  p.y = chest!.y;
  world.enqueueInput(0, { seq: seq.s++, tick: world.tick, action: InputAction.INTERACT, dir: 0, targetEntityId: chest!.id });
  world.step();
  const opens = world.consumeChestOpens();
  assert.equal(opens.length, 1, "开箱产生一次 ChestOpenEvent");
  assert.ok(opens[0].items.length >= 3 && opens[0].items.length <= 5, "开箱 3-5 件装备");
  assert.equal(opens[0].items.filter((i) => i.rarity === 3).length, 1, "必含 1 件暗金");
  assert.ok(!world.actors().some((a) => a.kind === EntityKind.CHEST), "开箱后宝箱消失");
});

test("复活：刷怪区清空 → 按 respawnTicks 复活敌人", () => {
  const world = mkWorld({
    seed: PROX_SEED,
    players: [{ seatId: 0, userId: "u0" }],
    spawnZones: [{ pos: NEAR, tier: 0, enemyTypeId: "n", count: 1, respawnTicks: 30 }],
  });
  const seq = { s: 0 };
  // 快速击杀：槽1(28) + 槽0(20) → 30-28-20 < 0
  issueSkill(world, 0, 1, seq);
  world.step();
  issueSkill(world, 0, 0, seq);
  world.step();
  assert.equal(world.actors().filter((a) => a.kind === EntityKind.ENEMY).length, 0, "敌人应已死亡");
  // 死亡 tick=1 → 复活 tick=31；步进至覆盖 31。
  let respawned = false;
  for (let i = 0; i < 40; i++) {
    world.step();
    if (world.actors().some((a) => a.kind === EntityKind.ENEMY)) {
      respawned = true;
      break;
    }
  }
  assert.ok(respawned, "敌人应在 respawnTicks 后复活");
});

test("BOSS 阶段：血量跨阈值 → 进入 phase 2", () => {
  const world = mkWorld({
    seed: PROX_SEED,
    players: [{ seatId: 0, userId: "u0" }],
    // respawnTicks 极大，避免死亡后复活干扰阶段判定（仅验证 phase 推进）。
    spawnZones: [{ pos: NEAR, tier: 2, enemyTypeId: "b", count: 1, respawnTicks: 100000 }],
  });
  const seq = { s: 0 };
  let reached = false;
  for (let i = 0; i < 700; i++) {
    const boss = findEnemy(world, EntityKind.BOSS);
    if (!boss) break; // 不应在进 phase 前死亡（phase 在 150 触发，死亡在 0）
    if ((boss.bossPhase ?? 0) >= 1) {
      reached = true;
      break;
    }
    issueSkill(world, 0, 3, seq); // 槽3 dmg36，cd96 → 5 击 ≈180 > 150 阈值
    world.step();
  }
  assert.ok(reached, "BOSS 血量 <50% 应进入 phase 2");
});

test("拾取：玩家重叠地面掉落 → consumePickups 返回且实体移除", () => {
  const world = mkWorld({ seed: "pick", players: [{ seatId: 0, userId: "u0" }] });
  world.spawnGroundLoot(0, { itemId: 12345, rarity: 2, affixes: [1, 2, 3], ttlTicks: LOOT_GROUND_TTL_TICKS });
  world.step(); // 玩家脚下 → 立即拾取
  const picks = world.consumePickups();
  assert.equal(picks.length, 1);
  assert.equal(picks[0].seatId, 0);
  assert.equal(picks[0].loot.itemId, 12345);
  assert.ok(
    !world.actors().some((a) => a.kind === EntityKind.LOOT_GROUND && a.loot?.itemId === 12345),
    "拾取后地面实体应移除",
  );
});

test("TTL：无玩家时地面掉落每 tick 递减", () => {
  const world = mkWorld({ seed: "ttl1", lootTokens: 1 }); // 无玩家 → 无拾取
  const loot = world.actors().find((a) => a.kind === EntityKind.LOOT_GROUND)!;
  const ttl0 = loot.loot!.ttlTicks;
  world.step();
  const after = world.actors().find((a) => a.kind === EntityKind.LOOT_GROUND);
  assert.ok(after, "无玩家不应被拾取");
  assert.equal(after!.loot!.ttlTicks, ttl0 - 1, "ttl 应每 tick 递减");
});

test("TTL：ttl=0 的地面掉落应被移除", () => {
  const world = mkWorld({ seed: "ttl0" }); // 无玩家
  world.spawnGroundLoot(0, { itemId: 555, rarity: 0, affixes: [], ttlTicks: 1 });
  world.step(); // ttl 1→0 → 移除
  assert.ok(
    !world.actors().some((a) => a.kind === EntityKind.LOOT_GROUND && a.loot?.itemId === 555),
    "ttl=0 的掉落应被移除",
  );
});
