/**
 * run-runtime.test.ts — 12Hz 主循环（C1 / C5）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { startRunLoop, TICK_RATE_REF, TICK_MS_REF } from "../src/run-runtime.ts";
import { TICK_RATE, TICK_MS } from "../sim-core/src/constants.ts"; // C1 单一来源

test("TICK_RATE bound to sim-core single source (C1: no local redefinition)", () => {
  // run-runtime 的 TICK_RATE 必须 === sim-core/constants.ts 的 TICK_RATE（唯一出处）。
  assert.equal(TICK_RATE_REF, TICK_RATE);
  assert.equal(TICK_RATE, 12);
  assert.ok(Math.abs(TICK_MS_REF - TICK_MS) < 1e-9);
  assert.ok(Math.abs(TICK_MS - 83.333) < 0.01);
});

test("run loop advances tick at ~12Hz and drains inputs", async () => {
  const ticks: number[] = [];
  const inputsSeen: number[] = [];
  const handle = startRunLoop({
    onTick(tick, inputs) {
      ticks.push(tick);
      for (const i of inputs) inputsSeen.push(i.seq);
    },
    onSnapshot() {
      return { tick: 0, roomId: "r", phase: 0, entities: [] } as never;
    },
    onBroadcast() {},
  });

  // 推进约 300ms（≈ 3-4 tick @12Hz）。
  handle.enqueueInput({ seq: 1, tick: 0, action: 0, dir: 0 } as never);
  await new Promise((r) => setTimeout(r, 350));
  handle.stop();

  assert.ok(ticks.length >= 3, `expected >=3 ticks in 350ms, got ${ticks.length}`);
  assert.equal(ticks[0], 0);
  assert.ok(inputsSeen.includes(1), "enqueued input was drained");
});

test("loop reports tickRate = 12", () => {
  const handle = startRunLoop({
    onTick() {},
    onSnapshot() {
      return { tick: 0, roomId: "r", phase: 0, entities: [] } as never;
    },
    onBroadcast() {},
  });
  assert.equal(handle.tickRate, 12);
  handle.stop();
});
