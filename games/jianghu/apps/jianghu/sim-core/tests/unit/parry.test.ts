/**
 * parry.test.ts — E4 格挡判定单测（纯函数）
 * ===========================================================================
 * 覆盖：judgeParry 窗口覆盖/过期、openParryWindow 计算（PARRY_TICKS）、
 *        off-by-one 边界（窗口恰 PARRY_TICKS 个 tick = 250ms，tick+3 不覆盖）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { judgeParry, openParryWindow, PARRY_TICKS, PARRY_REDUCTION } from "../../src/parry.ts";

test("judgeParry: active && applicationTick <= windowEndTick → covered", () => {
  const j = judgeParry({ active: true, windowEndTick: 100 }, 100);
  assert.equal(j.covered, true);
  assert.equal(j.reduction, PARRY_REDUCTION);
});

test("judgeParry: applicationTick > windowEndTick → not covered", () => {
  const j = judgeParry({ active: true, windowEndTick: 100 }, 101);
  assert.equal(j.covered, false);
  assert.equal(j.reduction, 0);
});

test("judgeParry: inactive → not covered", () => {
  const j = judgeParry({ active: false, windowEndTick: 100 }, 50);
  assert.equal(j.covered, false);
});

test("judgeParry: undefined parry → not covered", () => {
  const j = judgeParry(undefined, 50);
  assert.equal(j.covered, false);
  assert.equal(j.reduction, 0);
});

test("openParryWindow: windowEndTick = tick + PARRY_TICKS - 1（闭区间含末 tick）", () => {
  const p = openParryWindow(10);
  assert.equal(p.active, true);
  assert.equal(p.windowEndTick, 10 + PARRY_TICKS - 1); // PARRY_TICKS = 3 → 覆盖 tick 10..12 恰 3 tick
});

// O3 修复点：格挡窗口必须恰好 PARRY_TICKS 个 tick（250ms），不能因闭区间把末 tick 多算一个。
test("judgeParry 边界（off-by-one）：覆盖恰为 [tick, tick+PARRY_TICKS-1]（tick+2 covered / tick+3 not）", () => {
  const openedAt = 0;
  const p = openParryWindow(openedAt); // windowEndTick = 0 + PARRY_TICKS - 1 = 2 → 覆盖 tick 0,1,2
  // 第 3 tick（applicationTick = tick + 2）→ covered（窗口内最后一 tick）
  const inWindow = judgeParry(p, openedAt + PARRY_TICKS - 1);
  assert.equal(inWindow.covered, true, "第 PARRY_TICKS 个 tick（tick+2）必须 covered");
  assert.equal(inWindow.reduction, PARRY_REDUCTION);
  // 第 4 tick（applicationTick = tick + 3）→ not covered（off-by-one 修复：不得多覆盖 1 tick）
  const outWindow = judgeParry(p, openedAt + PARRY_TICKS);
  assert.equal(outWindow.covered, false, "第 PARRY_TICKS+1 个 tick（tick+3）必须不 covered");
  assert.equal(outWindow.reduction, 0);
});
