/**
 * movement.test.ts — E3 移动单测（纯函数 + world 集成；不依赖 ws）
 * ===========================================================================
 * 覆盖：8 向单 tick 位移量 = CELLS_PER_TICK*TILE（对角 √½ 归一化）、边界 clamp 不越界、
 * blocked 格沿自由轴滑动、stepMovement 返回新 Vec2 且不改入参、world 集成
 * （createWorld + addPlayer + enqueueInput(MOVE) + step → 坐标按预期变化）、
 * seq 回退被丢弃、确定性（同 seed + 同输入序列 ⇒ 同坐标序列，D9）、
 * STOP（协议缺口修复，P0 手感）：无 STOP 按住持续移动不回归 / STOP 后立即停无惯性滑行 /
 * STOP 后重新 MOVE 可继续 / seq 单调含 STOP（回退 seq 不生效）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { stepMovement, dirToVector } from "../../src/movement.ts";
import { createWorld } from "../../src/world.ts";
import { CELLS_PER_TICK, TILE } from "../../src/constants.ts"; // C7 单一来源
import { InputAction, RoomPhase, EntityKind } from "../../src/types.ts";

const STEP_PX = CELLS_PER_TICK * TILE; // 单 tick 位移（px）= (4/12)*48 = 16

test("8 向单 tick 位移量 = CELLS_PER_TICK*TILE（对角 √½ 归一化正确）", () => {
  for (let dir = 0; dir < 8; dir++) {
    const v = dirToVector(dir);
    const r = stepMovement({ x: 100, y: 100 }, dir);
    assert.ok(
      Math.abs(r.x - (100 + v.x * STEP_PX)) < 1e-9,
      `dir ${dir}: x 位移 = v.x * STEP_PX`,
    );
    assert.ok(
      Math.abs(r.y - (100 + v.y * STEP_PX)) < 1e-9,
      `dir ${dir}: y 位移 = v.y * STEP_PX`,
    );
    // 单 tick 位移幅度恒为 STEP_PX（对角 √½ 归一化后总位移仍是一格步长）。
    const mag = Math.hypot(r.x - 100, r.y - 100);
    assert.ok(Math.abs(mag - STEP_PX) < 1e-9, `dir ${dir}: 单 tick 步长 = ${STEP_PX}`);
  }
  // 对角 (dir 1=SE) 两轴分量应相等且为 √½*STEP，证明归一化正确。
  const se = stepMovement({ x: 0, y: 0 }, 1);
  assert.ok(Math.abs(se.x - Math.SQRT1_2 * STEP_PX) < 1e-9, "SE x = √½·STEP");
  assert.ok(Math.abs(se.y - Math.SQRT1_2 * STEP_PX) < 1e-9, "SE y = √½·STEP");
});

test("stepMovement 返回新 Vec2 且不改入参", () => {
  const pos = { x: 123, y: 456 };
  const r = stepMovement(pos, 0);
  assert.notEqual(r, pos, "返回的是新对象（非入参引用）");
  assert.equal(pos.x, 123, "入参 x 未被修改");
  assert.equal(pos.y, 456, "入参 y 未被修改");
  assert.ok(Math.abs(r.x - (123 + STEP_PX)) < 1e-9, "新对象 x 正确前进");
  assert.equal(r.y, 456, "新对象 y 不变（dir 0 纯东）");
});

test("blocked 格：纯 x 方向（dir 0）撞墙原地不动（不瞬移）", () => {
  // 墙在 grid 格 (5,5)。
  const blocked = (x: number, y: number): boolean => {
    const gx = Math.floor(x / TILE);
    const gy = Math.floor(y / TILE);
    return gx === 5 && gy === 5;
  };
  // 起点落在 cell (4,5) 右侧，使一次东进步恰好进入 cell (5,5)。
  const start = { x: 4 * TILE + 40, y: 5 * TILE + 24 };
  const r = stepMovement(start, 0, { isBlocked: blocked });
  assert.equal(r.x, start.x, "东向撞墙 → x 不动");
  assert.equal(r.y, start.y, "东向撞墙 → y 不动（dir 0 无 y 分量）");
});

test("blocked 格：对角（dir 1=SE）撞墙沿自由轴滑动（只走 x）", () => {
  // 墙在 grid 格 (5,5)。
  const blocked = (x: number, y: number): boolean => {
    const gx = Math.floor(x / TILE);
    const gy = Math.floor(y / TILE);
    return gx === 5 && gy === 5;
  };
  // 起点 cell (4,4) 右下角附近，SE 一步进入 (5,5) 墙。
  const start = { x: 4 * TILE + 40, y: 4 * TILE + 40 };
  const r = stepMovement(start, 1, { isBlocked: blocked });
  // 目标 (5,5) 被挡：x 轴可走（(5,4) 空）→ 只走 x，y 保持原 cell。
  assert.ok(Math.abs(r.x - (start.x + Math.SQRT1_2 * STEP_PX)) < 1e-9, "沿自由 x 轴滑动");
  assert.equal(r.y, start.y, "y 轴被墙挡住，保持原 y（cell 4）");
  // 滑入的位置本身不应落在墙上。
  assert.equal(blocked(r.x, r.y), false, "滑动落点不在墙内");
});

test("边界 clamp：玩家不越界且可抵达世界边缘（沿边缘滑动，不卡死）", () => {
  const world = createWorld({
    runId: "b",
    roomId: "room_b",
    seed: "B",
    phase: RoomPhase.OVERWORLD,
  });
  // 默认 bounds = 40*TILE × 30*TILE；出生在右边缘 cell (39,15)，持续向东。
  world.addPlayer(1, "u1", { x: 39 * TILE, y: 15 * TILE });
  let peak = 0;
  for (let i = 0; i < 25; i++) {
    world.enqueueInput(1, { seq: i + 1, tick: 0, action: InputAction.MOVE, dir: 0 });
    world.step();
    const p = world.actors().find((a) => a.ownerId === 1)!;
    peak = Math.max(peak, p.x);
    assert.ok(p.x <= 40 * TILE + 1e-9, `tick ${i}: 不越界 (x=${p.x.toFixed(2)})`);
  }
  const p = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(Math.abs(p.x - 40 * TILE) < 1e-6, "抵达右边缘（clamp 到世界尺寸）");
  assert.ok(peak <= 40 * TILE + 1e-9, "全程峰值不越界");
});

test("world 集成：addPlayer + enqueueInput(MOVE) + step → 玩家坐标按预期变化", () => {
  const world = createWorld({
    runId: "r",
    roomId: "room_r",
    seed: "R",
    phase: RoomPhase.OVERWORLD,
  });
  world.addPlayer(1, "u1"); // 默认出生 ((16+1)%40)*TILE = 17*TILE, 15*TILE
  const before = world.actors().find((a) => a.ownerId === 1)!;
  const x0 = before.x;
  const y0 = before.y;
  assert.equal(before.kind, EntityKind.PLAYER);

  // 向东移动一 tick。
  world.enqueueInput(1, { seq: 1, tick: 0, action: InputAction.MOVE, dir: 0 });
  world.step();
  const after = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(Math.abs(after.x - (x0 + STEP_PX)) < 1e-6, "东移恰好一 tick 步长");
  assert.equal(after.y, y0, "东移 y 不变");
  assert.equal(after.dir, 0, "朝向更新为指令方向");

  // 向南移动一 tick（dir 2 = S，+y）。
  world.enqueueInput(1, { seq: 2, tick: 0, action: InputAction.MOVE, dir: 2 });
  world.step();
  const after2 = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(Math.abs(after2.y - (y0 + STEP_PX)) < 1e-6, "南移恰好一 tick 步长");
  assert.equal(after2.dir, 2, "朝向更新为南");
});

test("seq 单调：回退 seq 静默丢弃（不改变朝向/位移）", () => {
  const world = createWorld({
    runId: "r",
    roomId: "room_r",
    seed: "R",
    phase: RoomPhase.OVERWORLD,
  });
  world.addPlayer(2, "u2");
  // 合法 seq 5 向东（dir 0）。
  world.enqueueInput(2, { seq: 5, tick: 0, action: InputAction.MOVE, dir: 0 });
  world.step();
  // 注意：actors() 返回浅拷贝数组但含同一 Actor 对象引用，须立即取标量快照，避免后续 step 改写。
  const a1 = world.actors().find((a) => a.ownerId === 2)!;
  const x1 = a1.x;
  const y1 = a1.y;
  // 回退 seq 3（< 5）向南（dir 2）→ 应被丢弃，玩家继续沿保留的东向移动。
  world.enqueueInput(2, { seq: 3, tick: 0, action: InputAction.MOVE, dir: 2 });
  world.step();
  const a2 = world.actors().find((a) => a.ownerId === 2)!;
  assert.ok(a2.x > x1, "保留的东向移动继续（x 增长）");
  assert.ok(Math.abs(a2.y - y1) < 1e-6, "被丢弃的南向 seq 未改变 y（回退被忽略）");
});

test("seq 单调：更高 seq 的合法 MOVE 覆盖朝向", () => {
  const world = createWorld({
    runId: "r",
    roomId: "room_r",
    seed: "R",
    phase: RoomPhase.OVERWORLD,
  });
  world.addPlayer(3, "u3");
  world.enqueueInput(3, { seq: 1, tick: 0, action: InputAction.MOVE, dir: 0 }); // 东
  world.step();
  const y0 = world.actors().find((a) => a.ownerId === 3)!.y;
  world.enqueueInput(3, { seq: 2, tick: 0, action: InputAction.MOVE, dir: 2 }); // 南（合法更高 seq）
  world.step();
  const a = world.actors().find((a) => a.ownerId === 3)!;
  assert.ok(Math.abs(a.y - (y0 + STEP_PX)) < 1e-6, "合法更高 seq 的南向生效（y 增长）");
  assert.equal(a.dir, 2, "朝向被新指令覆盖为南");
});

test("确定性：同一 seed + 同一输入序列 ⇒ 同一玩家坐标序列（D9）", () => {
  const seq = [1, 2, 3, 4, 5, 6, 7, 8];
  const run = (): number[] => {
    const w = createWorld({
      runId: "r",
      roomId: "room_d",
      seed: "DET-SEED",
      phase: RoomPhase.OVERWORLD,
    });
    w.addPlayer(1, "u1");
    const xs: number[] = [];
    for (const s of seq) {
      w.enqueueInput(1, { seq: s, tick: 0, action: InputAction.MOVE, dir: 0 });
      w.step();
      const p = w.actors().find((a) => a.ownerId === 1)!;
      xs.push(Math.round(p.x * 1000) / 1000);
    }
    return xs;
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, "同 seed + 同输入序列 → 完全相同的玩家坐标序列（确定性）");
});

// ============================================================================
// STOP（协议缺口修复，P0 手感）：松开移动键 → 清 lastMove 立即停，不再惯性滑行
// ============================================================================

function stopWorld(): ReturnType<typeof createWorld> {
  const w = createWorld({
    runId: "r-stop",
    roomId: "room_stop",
    seed: "STOP-SEED",
    phase: RoomPhase.OVERWORLD,
  });
  w.addPlayer(1, "u1", { x: 10 * TILE, y: 15 * TILE });
  return w;
}

test("STOP 不回归①：无 STOP 时按住持续移动（MOVE×N 后无输入仍续行，lastMove 语义保留）", () => {
  const world = stopWorld();
  for (let i = 1; i <= 3; i++) {
    world.enqueueInput(1, { seq: i, tick: 0, action: InputAction.MOVE, dir: 0 });
    world.step();
  }
  const x3 = world.actors().find((a) => a.ownerId === 1)!.x;
  assert.ok(Math.abs(x3 - (10 * TILE + 3 * STEP_PX)) < 1e-6, "MOVE×3：x 前进 3*STEP_PX");
  // 无输入 step（模拟丢包 / 未发 STOP）：仍应沿最后 MOVE 续行（按住语义不回归）。
  world.step();
  const a = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(Math.abs(a.x - (x3 + STEP_PX)) < 1e-6, "无 STOP 时无输入 tick 仍续行（不回归）");
});

test("STOP ②：MOVE×N 后 STOP → 下一 step 玩家停住（位置不再变，无惯性滑行）", () => {
  const world = stopWorld();
  for (let i = 1; i <= 3; i++) {
    world.enqueueInput(1, { seq: i, tick: 0, action: InputAction.MOVE, dir: 0 });
    world.step();
  }
  const xStop = world.actors().find((a) => a.ownerId === 1)!.x;
  const yStop = world.actors().find((a) => a.ownerId === 1)!.y;
  // 发 STOP（seq 4），此后不再发任何输入。
  world.enqueueInput(1, { seq: 4, tick: 0, action: InputAction.STOP, dir: 0 });
  world.step();
  const a1 = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(Math.abs(a1.x - xStop) < 1e-9 && Math.abs(a1.y - yStop) < 1e-9, "STOP 当 tick 不移动");
  // 再多步 5 tick（无输入），位置仍不变（lastMove 已清，不再沿最后 MOVE 惯性滑行）。
  for (let i = 0; i < 5; i++) world.step();
  const a2 = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(Math.abs(a2.x - xStop) < 1e-9 && Math.abs(a2.y - yStop) < 1e-9, "STOP 后续 tick 仍停住（无惯性滑行）");
});

test("STOP ③：STOP 后重新 MOVE 可继续（seq 单调含 STOP：回退 seq 不生效，合法 seq 恢复移动）", () => {
  const world = stopWorld();
  const y0 = 15 * TILE;
  for (let i = 1; i <= 3; i++) {
    world.enqueueInput(1, { seq: i, tick: 0, action: InputAction.MOVE, dir: 0 });
    world.step();
  }
  const xStop = world.actors().find((a) => a.ownerId === 1)!.x;
  // STOP 消耗 seq 4（C11：STOP 也走同一 seq 计数）。
  world.enqueueInput(1, { seq: 4, tick: 0, action: InputAction.STOP, dir: 0 });
  world.step();
  // 回退 seq 3 的 MOVE（< 4）→ 应被丢弃，玩家保持停住。
  world.enqueueInput(1, { seq: 3, tick: 0, action: InputAction.MOVE, dir: 2 });
  world.step();
  const a1 = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(Math.abs(a1.x - xStop) < 1e-9, "回退 seq 的 MOVE 被丢弃（x 不变）");
  assert.ok(Math.abs(a1.y - y0) < 1e-9, "回退 seq 的 MOVE 被丢弃（y 不变）");
  // 合法更高 seq 5 的 MOVE → 恢复移动（新方向 2=S，y 增长）。
  world.enqueueInput(1, { seq: 5, tick: 0, action: InputAction.MOVE, dir: 2 });
  world.step();
  const a2 = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(Math.abs(a2.y - (y0 + STEP_PX)) < 1e-6, "合法 seq 的 MOVE 恢复移动（y 前进）");
  assert.ok(Math.abs(a2.x - xStop) < 1e-9, "新方向不再沿用旧 dir 0（x 不变）");
});
