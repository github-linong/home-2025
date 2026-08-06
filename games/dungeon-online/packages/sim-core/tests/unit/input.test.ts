/**
 * input.test.ts — E4 每玩家输入队列 / C11 防重放 / 路由隔离（sim-core 单测）
 *
 * 覆盖：
 *  - 每玩家队列独立、drainForTick 取最新有效输入（同 tick 多包只留最新）
 *  - C11 seq 严格单调：重复/回放/倒序被拒，前向跳变允许
 *  - drain 清空 pending（防同输入跨 tick 重复生效）
 *  - world 层：每玩家输入路由到正确实体；A 的输入不移动 B；C11 回放在 world 层被拒
 *
 * 运行：node --experimental-strip-types --test tests/unit/input.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PerPlayerInputQueue, drainForTick } from "../../src/input.ts";
import { createWorld } from "../../src/world.ts";
import { InputAction, PLAYER_CLASSES, CLASS_BASE } from "../../src/types.ts";
import type { InputCmd } from "../../src/types.ts";

function cmd(seq: number, dir = { x: 1, y: 0 }, action = InputAction.MOVE): InputCmd {
  return { seq, tick: 0, action, dir };
}

test("per-player queue isolation: inputs for different players are independent", () => {
  const q = new PerPlayerInputQueue();
  q.register(0);
  q.register(1);
  assert.equal(q.enqueue(0, cmd(1)), true);
  assert.equal(q.enqueue(1, cmd(1)), true);
  const drained = q.drain();
  assert.equal(drained.get(0)?.seq, 1);
  assert.equal(drained.get(1)?.seq, 1);
  // 仅一玩家有输入时，另一玩家不应出现在 drain 中
  const q2 = new PerPlayerInputQueue();
  q2.register(0);
  q2.register(1);
  q2.enqueue(0, cmd(5));
  const d2 = q2.drain();
  assert.ok(d2.has(0));
  assert.ok(!d2.has(1), "player 1 with no input must not appear in drain");
});

test("C11 seq monotonic: rejects duplicate/replay/reverse, accepts forward jumps", () => {
  const q = new PerPlayerInputQueue();
  q.register(7);
  assert.equal(q.enqueue(7, cmd(1)), true);
  assert.equal(q.enqueue(7, cmd(1)), false, "duplicate seq must be rejected");
  assert.equal(q.enqueue(7, cmd(0)), false, "reverse/lower seq must be rejected");
  assert.equal(q.enqueue(7, cmd(2)), true, "forward seq accepted");
  assert.equal(q.enqueue(7, cmd(1)), false, "already-below lastSeq rejected");
  assert.equal(q.enqueue(7, cmd(5)), true, "forward jump accepted");
  assert.equal(q.enqueue(7, cmd(5)), false, "duplicate of latest rejected");
});

test("drainForTick returns latest valid input per player (coalesces same-tick)", () => {
  const q = new PerPlayerInputQueue();
  q.register(0);
  q.enqueue(0, cmd(1, { x: 1, y: 0 }));
  q.enqueue(0, cmd(2, { x: -1, y: 0 })); // 同 tick 内第二条有效输入覆盖
  const drained = drainForTick(q);
  assert.equal(drained.get(0)?.seq, 2, "only the latest valid input per tick survives");
});

test("drain clears pending: no double-apply across ticks", () => {
  const q = new PerPlayerInputQueue();
  q.register(0);
  q.enqueue(0, cmd(1));
  assert.ok(q.drain().has(0));
  const again = q.drain();
  assert.ok(!again.has(0), "pending must be cleared after drain");
  q.enqueue(0, cmd(2));
  assert.ok(q.drain().has(0), "re-enqueue produces a new pending");
});

test("world: per-player input routes to the right entity; A's input does not move B", () => {
  const world = createWorld({
    runId: "r",
    seed: "SEED",
    biomeId: 0,
    players: [
      { seatId: 0, userId: "A", classId: PLAYER_CLASSES[0] },
      { seatId: 1, userId: "B", classId: PLAYER_CLASSES[1] },
    ],
  });
  const ax0 = world.actors().find((a) => a.ownerId === 0)!.x;
  const bx0 = world.actors().find((a) => a.ownerId === 1)!.x;
  const by0 = world.actors().find((a) => a.ownerId === 1)!.y;

  world.enqueueInput(0, cmd(1, { x: 1, y: 0 })); // 仅 A 输入
  world.step();
  // O2 移动接管：每 tick 位移 = CLASS_BASE[classId].moveSpeed / 30（seat0=tank=140 → 140/30）。
  assert.equal(
    world.actors().find((a) => a.ownerId === 0)!.x,
    ax0 + CLASS_BASE[PLAYER_CLASSES[0]].moveSpeed / 30,
    "A moves right at class-driven speed",
  );
  assert.equal(
    world.actors().find((a) => a.ownerId === 1)!.x,
    bx0,
    "B must not move (no input)",
  );

  world.enqueueInput(1, cmd(1, { x: 0, y: 1 })); // B 输入
  world.step();
  assert.equal(
    world.actors().find((a) => a.ownerId === 1)!.y,
    by0 + CLASS_BASE[PLAYER_CLASSES[1]].moveSpeed / 30,
    "B moves down after its input (class-driven speed)",
  );
});

test("world: C11 replay rejected — lastProcessedSeq does not advance on replay", () => {
  const world = createWorld({
    runId: "r",
    seed: "SEED",
    biomeId: 0,
    players: [{ seatId: 0, userId: "A", classId: PLAYER_CLASSES[0] }],
  });
  assert.equal(world.enqueueInput(0, cmd(1)), true);
  world.step();
  assert.equal(world.snapshot().lastProcessedSeq![0], 1);

  // 回放 seq=1 → 应被拒
  assert.equal(world.enqueueInput(0, cmd(1)), false);
  world.step();
  assert.equal(
    world.snapshot().lastProcessedSeq![0],
    1,
    "replayed seq must not advance lastProcessedSeq",
  );

  // 前向 seq=2 → 接受
  assert.equal(world.enqueueInput(0, cmd(2)), true);
  world.step();
  assert.equal(world.snapshot().lastProcessedSeq![0], 2);
});
