/**
 * disconnect-input.test.ts — E16 断线清 lastMove（防断线角色漂移）
 * ===========================================================================
 * 覆盖：
 *   ① world.clearPlayerInput：玩家按住 MOVE 持续移动 → clearPlayerInput → step 坐标不再变化
 *     （step 不再续行；不动 actor 坐标/hp）；
 *   ② run-manager.onSeatDisconnect：bootResidentRun + addPlayerToRoom + enqueueInput → 断线清 →
 *      RESIDENT world step 玩家停（编排层接线，C6：gateway → run-manager → world）；
 *   ③ 重连后输入恢复：clearPlayerInput 后重新 enqueueInput（更高 seq）→ 玩家重新移动
 *     （lastSeq 保留，C11 seq 单调语义不变；幂等 addPlayer 不重置实体）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, type World } from "../sim-core/src/world.ts";
import { RoomPhase, InputAction } from "../sim-core/src/types.ts";
import { CELLS_PER_TICK, TILE } from "../sim-core/src/constants.ts";
import { bootResidentRun, addPlayerToRoom, enqueueInput, onSeatDisconnect, getWorld } from "../src/run-manager.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";

function mkWorld(): World {
  return createWorld({
    runId: "r",
    roomId: "rm",
    seed: "disconnect",
    phase: RoomPhase.OVERWORLD,
    lootTokens: 0, // 无环境掉落，隔离移动断言
  });
}

// ------------------------------------------------------------------
// ① world.clearPlayerInput：断线清续行 → step 坐标不变
// ------------------------------------------------------------------

test("① world.clearPlayerInput：按住 MOVE 持续移动 → 清理后 step 坐标不变（不动 actor/hp）", () => {
  const world = mkWorld();
  world.addPlayer(1, "u1");
  const seq = { s: 0 };

  // 按住 MOVE（dir=2=S）持续移动：连续 3 tick（无新输入，靠 lastMove 续行）。
  world.enqueueInput(1, { seq: seq.s++, tick: 0, action: InputAction.MOVE, dir: 2 });
  world.step();
  world.step();
  world.step();
  const p1 = world.actors().find((a) => a.ownerId === 1)!;
  const moved = p1.y > 15 * TILE; // 已向下移动（离开出生 y）
  assert.ok(moved, "lastMove 续行：玩家持续移动");

  // 断线清输入 → step 不再续行，坐标冻结（hp 不动）。
  const xBefore = p1.x;
  const yBefore = p1.y;
  const hpBefore = p1.hp;
  world.clearPlayerInput(1);
  world.step();
  world.step();
  const p2 = world.actors().find((a) => a.ownerId === 1)!;
  assert.equal(p2.x, xBefore, "清理后 x 不变（不再沿最后方向漂移）");
  assert.equal(p2.y, yBefore, "清理后 y 不变");
  assert.equal(p2.hp, hpBefore, "清理不动 actor hp");
});

// ------------------------------------------------------------------
// ② run-manager.onSeatDisconnect：编排层接线（RESIDENT world）
// ------------------------------------------------------------------

test("② onSeatDisconnect：断线 → RESIDENT world 玩家停步（C6 编排接线）", () => {
  bootResidentRun();
  const seat = 11;
  addPlayerToRoom(RESIDENT_ROOM_ID, seat, "u-disconnect");
  const rw = getWorld(RESIDENT_ROOM_ID)!;
  const seq = { s: 0 };

  // 按住 MOVE（dir=0=E）移动 3 tick。
  const p0 = rw.actors().find((a) => a.ownerId === seat)!;
  const x0 = p0.x;
  enqueueInput(RESIDENT_ROOM_ID, seat, { seq: seq.s++, tick: rw.tick, action: InputAction.MOVE, dir: 0 });
  rw.step();
  rw.step();
  const p1 = rw.actors().find((a) => a.ownerId === seat)!;
  const x1 = p1.x;
  assert.ok(x1 > x0, "移动发生（x 已变化）");

  // 断线清 → 后续 step 玩家冻结。
  onSeatDisconnect(RESIDENT_ROOM_ID, seat);
  rw.step();
  rw.step();
  const p2 = rw.actors().find((a) => a.ownerId === seat)!;
  assert.equal(p2.x, x1, "断线后 x 冻结（不再续行）");
  assert.equal(p2.y, p1.y, "断线后 y 冻结");
});

// ------------------------------------------------------------------
// ③ 重连后输入恢复（lastSeq 保留；seq 单调）
// ------------------------------------------------------------------

test("③ 重连恢复：clearPlayerInput 后新输入（更高 seq）→ 玩家重新移动", () => {
  const world = mkWorld();
  world.addPlayer(1, "u1");
  let seq = 0;

  // 首段移动：seq 0..2。
  world.enqueueInput(1, { seq: seq++, tick: 0, action: InputAction.MOVE, dir: 2 });
  world.step();
  world.step();
  const p1 = world.actors().find((a) => a.ownerId === 1)!;
  const y1 = p1.y;
  assert.ok(y1 > 15 * TILE, "断线前已移动");

  // 断线清 → 冻结。
  world.clearPlayerInput(1);
  world.step();
  const frozen = world.actors().find((a) => a.ownerId === 1)!;
  assert.equal(frozen.y, y1, "清理后冻结");

  // 重连恢复：新连接继续用更高 seq（lastSeq 未清，seq 仍单调有效）。
  world.enqueueInput(1, { seq: seq++, tick: world.tick, action: InputAction.MOVE, dir: 2 });
  world.step();
  world.step();
  const p2 = world.actors().find((a) => a.ownerId === 1)!;
  assert.ok(p2.y > y1 + CELLS_PER_TICK * TILE, "重连后重新移动（续行恢复）");
});
