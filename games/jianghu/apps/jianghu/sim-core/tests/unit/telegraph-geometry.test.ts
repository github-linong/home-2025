/**
 * telegraph-geometry.test.ts — E35 telegraph 三形状结算几何（quality-lead P1 修复）
 * ===========================================================================
 * 此前所有 shape 均圆形结算（dist<=radius），环形中心 / 锥形侧面被误命中，counterplay 缺失。
 * E35 落地三形状：
 *   0=圆环（内圈安全）/ 1=AOE填充（圆形）/ 2=锥形（朝 dir 扇形，绕后安全）/ 3=线性（MVP 圆形近似）。
 * 覆盖（确定性断言，D9：无随机、无 Date.now）：
 *   ① 锥形（ghostmother shape=2）：预警期绕侧面 → 落刀不命中；玩家不动 → 命中
 *   ② 圆环（magmacolossus shape=0）：中心（内圈）安全 / 环带命中 / 圈外不命中
 *   ③ 圆形（ironbone shape 默认 1）回归：圈内命中 / 圈外不命中（既有行为不变，golden 稳）
 * 实现：spawnZones enemyTypeId 选择 BOSS 变体；圆环测试先 boss.burnAoe=undefined 清除灼烧干扰
 *   （同 telegraph.test.ts bossPhase=1 直改 actor 先例，aggression:"passive" 隔离接触攻击）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase } from "../../src/types.ts";
import { TILE, TELEGRAPH_TICKS } from "../../src/constants.ts";

const BOSS_POS = { x: 20 * TILE, y: 15 * TILE };

function mkBossWorld(enemyTypeId: string, playerOffset: { x: number; y: number }): World {
  const world = createWorld({
    runId: "r",
    roomId: "rm",
    seed: `geo-${enemyTypeId}-${playerOffset.x}-${playerOffset.y}`,
    phase: RoomPhase.OVERWORLD,
    players: [{ seatId: 0, userId: "u0" }],
    lootTokens: 0,
    spawnZones: [{ pos: BOSS_POS, tier: 2, enemyTypeId, count: 1, respawnTicks: 100000, aggression: "passive" }],
  });
  const boss = world.actors().find((a) => a.kind === EntityKind.BOSS)!;
  const player = world.actors().find((a) => a.ownerId === 0)!;
  player.x = boss.x + playerOffset.x;
  player.y = boss.y + playerOffset.y;
  player.maxHp = 2000;
  player.hp = 2000;
  return world;
}

function findTelegraph(world: World) {
  return world.actors().find((a) => a.kind === EntityKind.TELEGRAPH);
}
function findPlayer(world: World) {
  return world.actors().find((a) => a.ownerId === 0)!;
}
function findBoss(world: World) {
  return world.actors().find((a) => a.kind === EntityKind.BOSS)!;
}

/** 触发主 AOE telegraph 生成（phase2）→ 推进到落刀 → 返回落刀后玩家 hp。 */
function hpAfterAoe(world: World): number {
  findBoss(world).bossPhase = 1;
  world.step(); // 生成 telegraph
  assert.ok(findTelegraph(world), "应生成 telegraph");
  for (let i = 0; i < TELEGRAPH_TICKS; i++) world.step(); // 落刀
  return findPlayer(world).hp;
}

// ─────────────────────────────────────────────────────────────
// ① 锥形（shape=2，幽冢鬼母鬼啸扇形，aoeRadius=120px）
// ─────────────────────────────────────────────────────────────

test("锥形：生成时 dir 指向目标玩家（正右 → dir=0 东）", () => {
  const w = mkBossWorld("ghostmother", { x: 60, y: 0 });
  findBoss(w).bossPhase = 1;
  w.step();
  const tg = findTelegraph(w);
  assert.ok(tg, "应生成 telegraph");
  assert.equal(tg.telegraph.shape, 2, "shape=2（锥形）");
  assert.equal(tg.dir, 0, "dir 朝东（dirToward→最近玩家）");
});

test("锥形：预警期绕到侧面（夹角 90° > 60°）→ 落刀不命中（counterplay）", () => {
  const w = mkBossWorld("ghostmother", { x: 60, y: 0 });
  const boss = findBoss(w);
  boss.bossPhase = 1;
  w.step(); // 生成锥形（dir 朝玩家正右）
  assert.ok(findTelegraph(w), "应生成 telegraph");
  // 预警期玩家绕到 BOSS 正上（侧面，夹角 90°）
  const p = findPlayer(w);
  p.x = boss.x;
  p.y = boss.y - 60;
  for (let i = 0; i < TELEGRAPH_TICKS; i++) w.step(); // 落刀
  assert.equal(findPlayer(w).hp, 2000, "绕到侧面后不命中（锥形扇形外）");
});

test("锥形：玩家不动（仍在扇形内）→ 落刀命中", () => {
  const w = mkBossWorld("ghostmother", { x: 60, y: 0 });
  const hp = hpAfterAoe(w);
  assert.ok(hp < 2000, "扇形内玩家应扣血");
});

// ─────────────────────────────────────────────────────────────
// ② 圆环（shape=0，熔岩巨像环形喷发，aoeRadius=96px，内圈=96×0.4≈38px）
// ─────────────────────────────────────────────────────────────

test("圆环：中心（内圈）安全", () => {
  const w = mkBossWorld("magmacolossus", { x: 0, y: 0 });
  findBoss(w).burnAoe = undefined; // 清除灼烧地面干扰（shape=1 圆形会命中中心）
  const hp = hpAfterAoe(w);
  assert.equal(hp, 2000, "中心玩家不扣血（内圈安全区）");
});

test("圆环：环带命中（内圈 < dist ≤ radius）", () => {
  const w = mkBossWorld("magmacolossus", { x: 60, y: 0 });
  findBoss(w).burnAoe = undefined;
  const hp = hpAfterAoe(w);
  assert.ok(hp < 2000, "环带玩家应扣血");
});

test("圆环：圈外不命中（dist > radius）", () => {
  const w = mkBossWorld("magmacolossus", { x: 110, y: 0 });
  findBoss(w).burnAoe = undefined;
  const hp = hpAfterAoe(w);
  assert.equal(hp, 2000, "圈外玩家不扣血");
});

// ─────────────────────────────────────────────────────────────
// ③ 圆形（shape=1，铁骨魁 aoeRadius=96px）回归——既有行为不变
// ─────────────────────────────────────────────────────────────

test("圆形：圈内命中（回归既有行为）", () => {
  const w = mkBossWorld("ironbone", { x: 60, y: 0 });
  const hp = hpAfterAoe(w);
  assert.ok(hp < 2000, "圆形圈内玩家应扣血");
});

test("圆形：圈外不命中（回归既有行为）", () => {
  const w = mkBossWorld("ironbone", { x: 100, y: 0 });
  const hp = hpAfterAoe(w);
  assert.equal(hp, 2000, "圆形圈外玩家不扣血");
});
