/**
 * patrol.test.ts — E24 敌人巡逻（确定性 ping-pong；D9 纯函数 + world 集成）
 * ===========================================================================
 * 覆盖（全部确定性断言，D9：无随机、无 Date.now）：
 *   ① 巡逻启用：无玩家（IDLE 无仇恨目标）→ 位置随 tick 沿 x 轴 ping-pong 往返；
 *   ② 巡逻幅度：|x - spawnOrigin.x| ≤ patrolTiles×TILE，y 恒定；
 *   ③ 确定性：同 seed + 同 tick 序列 ⇒ 位置序列字节级一致（D9）；
 *   ④ 仇恨（CHASE）：aggressive 巡逻怪玩家进入 AGGRO_RADIUS → 追击（停巡逻）；
 *   ⑤ 脱战回归：玩家离开半径 → 回归出生点 → 恢复巡逻（幅度内往返）；
 *   ⑥ 未配置巡逻（patrolTiles 缺省 = 0）：IDLE 完全静止（回归 E6 行为，golden 不扰动）。
 *
 * 纪律：本测试只启巡逻于「自建测试 zone」；run-manager bootResidentRun / dungeonGen
 * buildDungeonSpec / playtest 现有配置一律不加 patrolTiles → 主世界与副本行为字节级不变。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, patrolOffsetX, type World } from "../../src/world.ts";
import { EntityKind, RoomPhase } from "../../src/types.ts";
import { TILE, ENEMY_MOVE_SPEED, AGGRO_RADIUS, ENEMY_PATROL_MOVE_SPEED } from "../../src/constants.ts";

interface TestZone {
  pos: { x: number; y: number };
  tier: 0 | 1 | 2;
  enemyTypeId: string;
  count: number;
  aggression?: "passive" | "aggressive";
  /** E24：巡逻半径（格）；缺省 0 = 不巡逻。 */
  patrolTiles?: number;
}

function mkWorld(opts: { seed?: string; spawnZones?: TestZone[] }): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: opts.seed ?? "PATROL",
    phase: RoomPhase.OVERWORLD,
    spawnZones: opts.spawnZones,
    lootTokens: 0, // 无环境掉落，隔离巡逻断言
  });
}

function findEnemy(world: World) {
  return world.actors().find((a) => a.kind === EntityKind.ENEMY)!;
}

// ─────────────────────────────────────────────────────────────
// ① 巡逻往返 + ② 幅度（y 恒定、|dx| ≤ patrolTiles×TILE、覆盖两侧端点）
// ─────────────────────────────────────────────────────────────

test("① 巡逻启用：无玩家 IDLE → 沿 x 轴 ping-pong 往返，幅度 = patrolTiles×TILE", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({ seed: "patrol-basic", spawnZones: [{ pos: P, tier: 0, enemyTypeId: "e", count: 1, patrolTiles: 2 }] });
  const enemy = findEnemy(world);
  const ox = enemy.x; // spawnOrigin = 实例化 pos（含散布）
  const oy = enemy.y;
  const amp = 2 * TILE; // 96px
  const xs: number[] = [];
  // 200 tick：half=24（2 格 / (1/12 格/tick)），周期=96 → 覆盖完整往返 + 2 个周期
  for (let i = 0; i < 200; i++) {
    world.step();
    const e = world.actors().find((a) => a.id === enemy.id)!;
    xs.push(e.x);
    assert.equal(e.y, oy, "y 恒定（沿 x 轴巡逻）");
    assert.ok(Math.abs(e.x - ox) <= amp + 1e-6, `巡逻幅度 ≤ patrolTiles×TILE：|dx|=${Math.abs(e.x - ox).toFixed(2)}`);
  }
  // 往返覆盖两侧端点：tick=24 → +amp；tick=72 → -amp（patrolOffsetX 三角波）
  const maxX = Math.max(...xs);
  const minX = Math.min(...xs);
  assert.ok(Math.abs(maxX - (ox + amp)) < 1e-6, `右端到达 +amp：max=${maxX.toFixed(2)} (期望 ${ox + amp})`);
  assert.ok(Math.abs(minX - (ox - amp)) < 1e-6, `左端到达 -amp：min=${minX.toFixed(2)} (期望 ${ox - amp})`);
});

// ─────────────────────────────────────────────────────────────
// ③ 确定性：同 seed + 同 tick 序列 ⇒ 位置序列字节级一致
// ─────────────────────────────────────────────────────────────

test("③ 确定性：同 seed + 同 tick 序列 ⇒ 巡逻位置序列字节级一致（D9）", () => {
  const run = (): number[] => {
    const P = { x: 20 * TILE, y: 15 * TILE };
    const world = mkWorld({ seed: "patrol-det", spawnZones: [{ pos: P, tier: 0, enemyTypeId: "e", count: 1, patrolTiles: 3 }] });
    const enemy = findEnemy(world);
    const xs: number[] = [];
    for (let i = 0; i < 150; i++) {
      world.step();
      const e = world.actors().find((a) => a.id === enemy.id)!;
      xs.push(Math.round(e.x * 1000) / 1000);
    }
    return xs;
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "同 seed + 同输入 → 巡逻位置序列字节级一致（D9）");
});

// ─────────────────────────────────────────────────────────────
// ④ 仇恨（CHASE）：aggressive 巡逻怪玩家进入半径 → 追击（停巡逻）
// ─────────────────────────────────────────────────────────────

test("④ 仇恨：aggressive 巡逻怪玩家进入 AGGRO_RADIUS → CHASE 追击（停巡逻）", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({ seed: "patrol-chase", spawnZones: [{ pos: P, tier: 1, enemyTypeId: "e", count: 1, patrolTiles: 2 }] });
  const enemy = findEnemy(world);
  const ox = enemy.x;
  world.addPlayer(1, "u1", { x: enemy.x + 120, y: enemy.y }); // 半径内（240px）、接触外（48px）
  for (let i = 0; i < 5; i++) world.step();
  const e = world.actors().find((a) => a.id === enemy.id)!;
  // CHASE = stepMovement 纯积分：5 tick × ENEMY_MOVE_SPEED×TILE（8px）= 40px；
  // 若仍在巡逻：patrolOffsetX(5,2)=+20px —— 两者可区分，40px 证明追击覆盖巡逻。
  const expected = 5 * ENEMY_MOVE_SPEED * TILE;
  assert.ok(
    Math.abs(e.x - ox - expected) < 1e-6,
    `CHASE 追击（停巡逻）：Δx=${(e.x - ox).toFixed(2)} ≈ ${expected.toFixed(2)}（巡逻应为 +20px）`,
  );
});

// ─────────────────────────────────────────────────────────────
// ⑤ 脱战回归：玩家离开半径 → 回归出生点 → 恢复巡逻（幅度内往返）
// ─────────────────────────────────────────────────────────────

test("⑤ 脱战回归：玩家离开 AGGRO_RADIUS → 回归出生点 → 恢复巡逻", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({ seed: "patrol-return", spawnZones: [{ pos: P, tier: 1, enemyTypeId: "e", count: 1, patrolTiles: 2 }] });
  const enemy = findEnemy(world);
  const ox = enemy.x;
  const oy = enemy.y;
  const amp = 2 * TILE;
  // 追击一段远离出生点（CHASE 追入接触内即停：20 tick 内离开 ~72px，>50px 可证已离原点）。
  world.addPlayer(1, "u1", { x: enemy.x + 120, y: enemy.y });
  for (let i = 0; i < 20; i++) world.step();
  const e1 = world.actors().find((a) => a.id === enemy.id)!;
  assert.ok(e1.x > ox + 50, `CHASE 已远离出生点：x=${e1.x.toFixed(1)} (origin=${ox.toFixed(1)})`);
  // 玩家移出仇恨半径 → 脱战回归 → 到达出生点后恢复巡逻
  world.removePlayer(1);
  world.addPlayer(1, "u1", { x: e1.x + AGGRO_RADIUS + 100, y: e1.y });
  for (let i = 0; i < 300; i++) world.step(); // 回归（~20 tick）+ 巡逻（周期 96 tick）充足
  const e2 = world.actors().find((a) => a.id === enemy.id)!;
  assert.equal(e2.y, oy, "y 恒定（巡逻沿 x 轴）");
  assert.ok(Math.abs(e2.x - ox) <= amp + 1e-6, `回归后位置在巡逻幅度内：dx=${(e2.x - ox).toFixed(2)}`);
  // 恢复巡逻后继续往返：后续 100 tick 轨迹覆盖左右两侧端点
  const xs: number[] = [];
  for (let i = 0; i < 100; i++) {
    world.step();
    xs.push(world.actors().find((a) => a.id === enemy.id)!.x);
  }
  assert.ok(Math.max(...xs) - ox >= amp - 1e-6, "恢复巡逻后到达右端 +amp");
  assert.ok(ox - Math.min(...xs) >= amp - 1e-6, "恢复巡逻后到达左端 -amp");
});

// ─────────────────────────────────────────────────────────────
// ⑥ 未配置巡逻（patrolTiles 缺省 = 0）：IDLE 完全静止（回归 E6 行为）
// ─────────────────────────────────────────────────────────────

test("⑥ 未配置巡逻：IDLE 完全静止（回归 E6 行为，不扰动 golden）", () => {
  const P = { x: 20 * TILE, y: 15 * TILE };
  const world = mkWorld({ seed: "patrol-off", spawnZones: [{ pos: P, tier: 0, enemyTypeId: "e", count: 1 }] });
  const enemy = findEnemy(world);
  const ex = enemy.x;
  const ey = enemy.y;
  for (let i = 0; i < 60; i++) world.step();
  const e = world.actors().find((a) => a.id === enemy.id)!;
  assert.equal(e.x, ex, "未配置巡逻 → x 不动");
  assert.equal(e.y, ey, "未配置巡逻 → y 不动");
});

// ─────────────────────────────────────────────────────────────
// ⑦ patrolOffsetX 纯函数：tick 0 / half / 2half / 3half / full 折返点精确
// ─────────────────────────────────────────────────────────────

test("⑦ patrolOffsetX 折返点：0→0、half→+amp、2half→0、3half→-amp、full→0", () => {
  const tiles = 2;
  const amp = tiles * TILE; // 96
  const half = tiles / ENEMY_PATROL_MOVE_SPEED; // 24（1 格/s @12Hz → 1/12 格/tick）
  const full = 4 * half; // 96
  assert.equal(patrolOffsetX(0, tiles), 0);
  assert.equal(patrolOffsetX(half, tiles), amp);
  assert.equal(patrolOffsetX(2 * half, tiles), 0);
  assert.equal(patrolOffsetX(3 * half, tiles), -amp);
  assert.equal(patrolOffsetX(full, tiles), 0);
  assert.equal(patrolOffsetX(100, 0), 0, "patrolTiles=0 → 恒 0（不巡逻）");
});
