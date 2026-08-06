/**
 * run-runtime.test.ts — E1.S1.3 真实 30Hz 主循环验证
 * 验证：循环真在按 ~30Hz 推进 tick、每 tick 产出并广播权威快照、输入队列被排空。
 * （S1.3 核心交付：服务器真在 tick 世界，而非占位。）
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  startRunLoop,
  TICK_RATE,
  TICK_MS,
} from "../src/run-runtime.ts";
import type { InputCmd, WorldSnapshot } from "../../../packages/sim-core/src/types.ts";

test("S1.3 TICK_RATE constant is locked at 30Hz (C1)", () => {
  assert.equal(TICK_RATE, 30);
  assert.ok(Math.abs(TICK_MS - 33.3333) < 0.01);
});

test("S1.3 real 30Hz loop advances ticks and broadcasts snapshots", async () => {
  let ticks = 0;
  let broadcasts = 0;
  const drainedInputs: InputCmd[] = [];
  const fakeSnapshot: WorldSnapshot = {
    tick: 0,
    runId: "r",
    roomPhase: 1,
    entities: [],
  };

  const handle = startRunLoop({
    onTick(t, inputs) {
      ticks += 1;
      for (const i of inputs) drainedInputs.push(i);
      fakeSnapshot.tick = t;
    },
    onSnapshot() {
      return fakeSnapshot;
    },
    onBroadcast() {
      broadcasts += 1;
    },
  });

  // 入队一个输入指令，验证输入队列被排空到 onTick。
  const cmd: InputCmd = {
    seq: 7,
    tick: 0,
    action: 0,
    dir: { x: 1, y: 0 },
  };
  handle.enqueueInput(cmd);

  await new Promise((r) => setTimeout(r, 250));
  handle.stop();

  // 250ms @30Hz ≈ 7.5 ticks；给足下界避免 CI 抖动。
  assert.ok(ticks >= 4, `expected >=4 ticks, got ${ticks}`);
  assert.ok(broadcasts >= 4, `expected >=4 broadcasts, got ${broadcasts}`);
  assert.equal(ticks, broadcasts, "every tick must broadcast exactly one snapshot");
  assert.ok(
    drainedInputs.some((i) => i.seq === 7),
    "enqueued input must be drained into onTick",
  );
  assert.ok(handle.getTick() >= 4);
});

test("S1.3 stop halts the loop", async () => {
  let ticks = 0;
  const handle = startRunLoop({
    onTick() {
      ticks += 1;
    },
    onSnapshot() {
      return { tick: 0, runId: "r", roomPhase: 1, entities: [] };
    },
    onBroadcast() {},
  });
  handle.stop();
  const afterStop = ticks;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(ticks, afterStop, "no further ticks after stop()");
});
