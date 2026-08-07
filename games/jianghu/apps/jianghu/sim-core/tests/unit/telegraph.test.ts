/**
 * telegraph.test.ts — E15 BOSS telegraph 预警确定性单测（D2 落地：world 生成 + 快照下发）
 * ===========================================================================
 * 覆盖（全部确定性断言，D9：无随机、无 Date.now；telegraph 纯 tick 驱动，不消耗 Rng）：
 *   ① BOSS phase2（bossPhase≥1）战斗态 → 生成 TELEGRAPH 实体（kind=4 / pos / 字段正确：
 *     shape=1(AOE填充) color=0(DANGER) startTick=t applyTick=t+TELEGRAPH_TICKS radius=TELEGRAPH_RADIUS）
 *   ② applyTick 到点 → 圈内玩家 resolveDamage（扣血 = BOSS atk×1.5）+ 实体移除（ttl 清理）
 *   ③ 圈外玩家不扣血（> radius 但仍在仇恨半径内 → telegraph 仍生成但不伤圈外）
 *   ④ phase1（bossPhase=0）不生成 telegraph（普通接触攻击不加预警，playtest golden 稳）
 *   ⑤ 非战斗态（目标在仇恨半径外）不生成 telegraph
 *   ⑥ 确定性：同 seed + 同输入 → 同 telegraph 生成/落刀序列（D9）
 *
 * 说明：直接改 actor 字段（boss.bossPhase / player pos+hp）同 death.test forceDowned 先例
 * （world.actors() 返回浅拷贝，Actor 对象同引用）。用 aggression:"passive" 隔离——被动怪
 * 不追击不接触攻击，仅验证 telegraph AOE 本身；真实 BOSS 默认 aggressive，telegraph 门闸
 * 只看「目标在仇恨半径内」（best ≤ AGGRO_RADIUS），与敌人类别无关（playtest 已实测）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase } from "../../src/types.ts";
import {
  TILE,
  ENEMY_BASE_ATK,
  HP_MULT,
  TELEGRAPH_TICKS,
  TELEGRAPH_RADIUS,
  BOSS_AOE_INTERVAL_TICKS,
  BOSS_AOE_DAMAGE_MULT,
} from "../../src/constants.ts";

/** BOSS AOE 落刀伤害 = BOSS atk × 1.5（C7 单一来源推导）。 */
const BOSS_AOE_DMG = Math.round(ENEMY_BASE_ATK * HP_MULT.boss * BOSS_AOE_DAMAGE_MULT);

const BOSS_POS = { x: 20 * TILE, y: 15 * TILE };

function mkBossWorld(seed: string, playerOffset: { x: number; y: number }): { world: World; bossX: number; bossY: number } {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed,
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    // aggression:"passive"：不追不打，隔离 telegraph AOE（真实 BOSS 默认 aggressive，门闸只依赖仇恨半径）。
    spawnZones: [{ pos: BOSS_POS, tier: 2, enemyTypeId: "b", count: 1, respawnTicks: 100000, aggression: "passive" }],
  });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  const player = world.actors().find((a) => a.ownerId === 0)!;
  // 玩家按相对 BOSS 实际 pos（散布后）放置，保证确定性断言与散布无关。
  player.x = boss.x + playerOffset.x;
  player.y = boss.y + playerOffset.y;
  player.maxHp = 200;
  player.hp = 200;
  return { world, bossX: boss.x, bossY: boss.y };
}

function findTelegraph(world: World) {
  return world.actors().find((a) => a.kind === EntityKind.TELEGRAPH);
}
function findPlayer(world: World, seat = 0) {
  return world.actors().find((a) => a.ownerId === seat)!;
}

// ─────────────────────────────────────────────────────────────
// ① phase2 战斗态生成 TELEGRAPH 实体（字段正确）
// ─────────────────────────────────────────────────────────────

test("① BOSS phase2 战斗态生成 TELEGRAPH 实体（kind=4 / pos / telegraph 字段正确）", () => {
  const { world, bossX, bossY } = mkBossWorld("tg-1", { x: 60, y: 0 }); // 圈内(≤72) 仇恨内(≤240)
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  boss.bossPhase = 1; // 强制 phase2（同 death.test forceDowned 先例）
  world.step(); // t=0 → 首次 AOE 预警生成
  const tg = findTelegraph(world);
  assert.ok(tg, "phase2 战斗态应生成 TELEGRAPH 实体");
  assert.equal(tg.kind, EntityKind.TELEGRAPH, "kind=TELEGRAPH(4)");
  assert.equal(tg.telegraph.shape, 1, "shape=1（AOE 填充）");
  assert.equal(tg.telegraph.color, 0, "color=0（DANGER 红）");
  assert.equal(tg.telegraph.startTick, 0, "startTick=当前 tick");
  assert.equal(tg.telegraph.applyTick, TELEGRAPH_TICKS, "applyTick=startTick+TELEGRAPH_TICKS");
  assert.equal(tg.telegraph.radius, TELEGRAPH_RADIUS, "radius=TELEGRAPH_RADIUS(1.5×TILE)");
  assert.equal(Math.round(tg.x), Math.round(bossX), "telegraph 在 BOSS 位置 x");
  assert.equal(Math.round(tg.y), Math.round(bossY), "telegraph 在 BOSS 位置 y");
});

// ─────────────────────────────────────────────────────────────
// ② applyTick 到点 → 圈内玩家扣血 + 实体移除（ttl 清理）
// ─────────────────────────────────────────────────────────────

test("② applyTick 到点 → 圈内玩家扣血（BOSS atk×1.5）+ telegraph 移除", () => {
  const { world } = mkBossWorld("tg-2", { x: 60, y: 0 }); // 圈内
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  boss.bossPhase = 1;
  world.step(); // t=0 生成
  const p0 = findPlayer(world);
  assert.equal(p0.hp, 200, "落刀前未扣血");
  // 推进 TELEGRAPH_TICKS（t=1..12；t=12 ≥ applyTick=12 → 落刀 + 移除）
  for (let i = 0; i < TELEGRAPH_TICKS; i++) world.step();
  const p = findPlayer(world);
  assert.equal(p.hp, 200 - BOSS_AOE_DMG, `圈内玩家扣 ${BOSS_AOE_DMG}（200→${200 - BOSS_AOE_DMG}）`);
  assert.ok(!findTelegraph(world), "applyTick 到点 telegraph 实体应移除（ttl 清理）");
  // 后续 tick 不再残留
  world.step();
  assert.ok(!findTelegraph(world), "后续 tick 无残留 telegraph");
});

// ─────────────────────────────────────────────────────────────
// ③ 圈外玩家不扣血
// ─────────────────────────────────────────────────────────────

test("③ 圈外玩家（> radius 但仇恨内）不扣血", () => {
  const { world } = mkBossWorld("tg-3", { x: 100, y: 0 }); // 100 > 72（圈外）、≤240（仇恨内 → telegraph 仍生成）
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  boss.bossPhase = 1;
  world.step(); // 生成（目标在仇恨内）
  assert.ok(findTelegraph(world), "圈外玩家仍触发 telegraph 生成（仇恨内）");
  for (let i = 0; i < TELEGRAPH_TICKS; i++) world.step();
  const p = findPlayer(world);
  assert.equal(p.hp, 200, "圈外玩家不扣血（distance > radius）");
});

// ─────────────────────────────────────────────────────────────
// ④ phase1 不生成 telegraph
// ─────────────────────────────────────────────────────────────

test("④ phase1（bossPhase=0）不生成 telegraph（普通接触攻击不加预警）", () => {
  const { world } = mkBossWorld("tg-4", { x: 60, y: 0 });
  // bossPhase 保持 0（phase1）；玩家在仇恨内 → 战斗态，但 phase1 无 AOE 预警。
  let saw = false;
  for (let i = 0; i < 100; i++) {
    world.step();
    if (findTelegraph(world)) saw = true;
  }
  assert.ok(!saw, "phase1 全程不生成 TELEGRAPH");
});

// ─────────────────────────────────────────────────────────────
// ⑤ 非战斗态不生成 telegraph
// ─────────────────────────────────────────────────────────────

test("⑤ 非战斗态（目标在仇恨半径外）不生成 telegraph", () => {
  const { world } = mkBossWorld("tg-5", { x: 300, y: 0 }); // 300 > 240（仇恨外）
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  boss.bossPhase = 1; // phase2 但无战斗目标 → 不预警
  let saw = false;
  for (let i = 0; i < 100; i++) {
    world.step();
    if (findTelegraph(world)) saw = true;
  }
  assert.ok(!saw, "无目标（仇恨外）不生成 TELEGRAPH");
});

// ─────────────────────────────────────────────────────────────
// ⑥ 确定性：同 seed + 同输入 → 同 telegraph 序列（D9）
// ─────────────────────────────────────────────────────────────

test("⑥ 确定性：同 seed + 同输入 ⇒ 同 telegraph 生成/落刀序列（D9）", () => {
  const run = (): { spawnTicks: number[]; applyTicks: number[]; damageAppliedAt: number } => {
    const { world } = mkBossWorld("tg-det", { x: 60, y: 0 });
    const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
    boss.bossPhase = 1;
    const spawnTicks: number[] = [];
    const applyTicks: number[] = [];
    let damageAppliedAt = -1;
    for (let i = 0; i < BOSS_AOE_INTERVAL_TICKS * 2 + TELEGRAPH_TICKS; i++) {
      const before = world.actors().filter((a) => a.kind === EntityKind.TELEGRAPH);
      world.step();
      const after = world.actors().filter((a) => a.kind === EntityKind.TELEGRAPH);
      // 新增 telegraph（before 无、after 有）→ 生成于本 tick（world.tick-1）
      if (before.length === 0 && after.length > 0) spawnTicks.push(world.tick - 1);
      // 消失（before 有、after 无）→ applyTick 落刀于本 tick（world.tick-1）
      if (before.length > 0 && after.length === 0) {
        applyTicks.push(world.tick - 1);
        if (damageAppliedAt < 0) damageAppliedAt = world.tick - 1;
      }
    }
    return { spawnTicks, applyTicks, damageAppliedAt };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "同 seed + 同输入 → telegraph 生成/落刀序列字节级一致");
  assert.ok(a.spawnTicks.length >= 2, "phase2 周期内应多次生成（首次 + 每 BOSS_AOE_INTERVAL_TICKS）");
  assert.equal(a.spawnTicks[1] - a.spawnTicks[0], BOSS_AOE_INTERVAL_TICKS, "AOE 间隔 = BOSS_AOE_INTERVAL_TICKS(36)");
  assert.equal(a.applyTicks[0] - a.spawnTicks[0], TELEGRAPH_TICKS, "落刀在生成后 TELEGRAPH_TICKS");
});

// ─────────────────────────────────────────────────────────────
// ⑦ 快照条件序列化（C12）：telegraph 字段经 snapshot 下发
// ─────────────────────────────────────────────────────────────

test("⑦ C12：telegraph 经快照条件序列化（仅 TELEGRAPH 实体携带，其余实体无该字段）", () => {
  const { world } = mkBossWorld("tg-snap", { x: 60, y: 0 });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  boss.bossPhase = 1;
  world.step();
  const snap = world.snapshot();
  const tgEnt = snap.entities.find((e) => e.kind === EntityKind.TELEGRAPH);
  assert.ok(tgEnt, "快照含 TELEGRAPH 实体");
  assert.deepEqual(
    {
      shape: tgEnt.telegraph!.shape,
      color: tgEnt.telegraph!.color,
      startTick: tgEnt.telegraph!.startTick,
      applyTick: tgEnt.telegraph!.applyTick,
      radius: tgEnt.telegraph!.radius,
    },
    { shape: 1, color: 0, startTick: 0, applyTick: TELEGRAPH_TICKS, radius: TELEGRAPH_RADIUS },
    "telegraph 字段经快照下发（C12 条件序列化）",
  );
  // 非 TELEGRAPH 实体不带 telegraph 字段（不污染确定性哈希）
  const others = snap.entities.filter((e) => e.kind !== EntityKind.TELEGRAPH);
  assert.ok(others.every((e) => e.telegraph === undefined), "非 TELEGRAPH 实体不携带 telegraph 字段");
});
