/**
 * entrance-validation.test.ts — E16 入口服务端坐标校验（dungeon.enter 需玩家在 ENTRANCE 交互半径内）
 * ===========================================================================
 * 覆盖：
 *   ① 玩家在主世界出生点（距入口 > 1.5×TILE）发 dungeon.enter → 拒绝 NOT_AT_ENTRANCE（不建实例）；
 *   ② 玩家走到入口旁（≤ ENTRANCE_INTERACT_RADIUS=72px）→ dungeon.enter.ok；
 *   ③ 坐标校验与冷却共存：位置通过但冷却未到 → ENTRANCE_COOLDOWN（C-Dgn-4 闸门仍在）；
 *   ④ dungeon.exit 不校验坐标（任意位置可出；主世界内出本仍 NOT_IN_INSTANCE，域边界不变）。
 *
 * 位置基线（C7）：ENTRANCE=(20*TILE, 15*TILE)=(960,720)；addPlayerToRoom 出生点 (17*TILE,15*TILE)=(816,720)，
 * 距离 144px > 72px → 出生点直接 enter 应被拒。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bootResidentRun, enterInstance, exitInstance, getWorld, isInstanceRunning } from "../src/run-manager.ts";
import { dispatch } from "../src/protocol.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { ENTRANCE_INTERACT_RADIUS, TILE, RESPAWN_POS, BIOME_DEFAULT } from "../sim-core/src/constants.ts";

type Reply = { type: string; [key: string]: unknown };
function replyOf(r: { reply?: unknown }): Reply | undefined {
  return r.reply as Reply | undefined;
}
function errCode(r: { reply?: unknown }): string | undefined {
  const rep = replyOf(r);
  if (rep?.type !== "game.error") return undefined;
  return (rep as unknown as { error: { code: string } }).error?.code;
}

/** 把 seat 玩家精确放到入口旁（remove+add，幂等确定性定位；镜像 playtest placePlayer 模式）。 */
function placeNearEntrance(seat: number, userId: string): void {
  const rw = getWorld(RESIDENT_ROOM_ID)!;
  rw.removePlayer(seat);
  rw.addPlayer(seat, userId, { x: 20 * TILE, y: 15 * TILE + ENTRANCE_INTERACT_RADIUS / 2 });
}

const SEAT = 1;
const USER = "u-ent-val";

// ------------------------------------------------------------------
// ① 出生点（远）→ NOT_AT_ENTRANCE
// ------------------------------------------------------------------

test("① 玩家在入口外（出生点距入口 144px > 72px）dungeon.enter → NOT_AT_ENTRANCE（不建实例）", () => {
  bootResidentRun();
  // addPlayerToRoom 缺省出生点 (17*TILE, 15*TILE) = (816,720)，距 ENTRANCE (960,720) = 144px。
  const rw = getWorld(RESIDENT_ROOM_ID)!;
  rw.removePlayer(SEAT);
  rw.addPlayer(SEAT, USER, undefined);
  const p = rw.actors().find((a) => a.ownerId === SEAT)!;
  const dist = Math.hypot(p.x - 20 * TILE, p.y - 15 * TILE);
  assert.ok(dist > ENTRANCE_INTERACT_RADIUS, `出生点距入口 ${dist.toFixed(1)}px > ${ENTRANCE_INTERACT_RADIUS}px`);

  const res = dispatch(
    { userId: USER, connId: "c-ent-1", seatId: SEAT, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.enter", requestId: "e1", payload: { entranceId: 300 } },
  );
  assert.equal(replyOf(res)?.type, "game.error");
  assert.equal(errCode(res), "NOT_AT_ENTRANCE");
  // 未建实例（无 waiting / 无正式实例）。
  const r2 = enterInstance(300, [{ seatId: SEAT, userId: USER }], { lifetimeMs: 10 ** 12 });
  assert.equal(r2.ok, true, "坐标校验拒绝后入口未占用（可正常创建）");
  exitInstance(r2.instanceRoomId!, { seatId: SEAT });
});

// ------------------------------------------------------------------
// ② 入口旁 → dungeon.enter.ok
// ------------------------------------------------------------------

test("② 玩家走到入口旁（≤72px）→ dungeon.enter.ok（坐标校验放行）", () => {
  bootResidentRun();
  placeNearEntrance(SEAT, USER);
  const res = dispatch(
    { userId: USER, connId: "c-ent-2", seatId: SEAT, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.enter", requestId: "e2", payload: { entranceId: 301 } },
  );
  assert.equal(replyOf(res)?.type, "dungeon.enter.ok", "入口旁进入成功");
  assert.equal(replyOf(res)?.biomeId, BIOME_DEFAULT, "E34：dungeon.enter.ok 下发 biomeId（默认入口 → 0）");
  const instId = res.roomId as string;
  assert.ok(instId && instId !== RESIDENT_ROOM_ID, "切换到实例房间");
  assert.equal(isInstanceRunning(instId), true);
  // 清理：出本（等待中最后成员 → 解散，释放入口 301）。
  exitInstance(instId, { seatId: SEAT });
  assert.equal(isInstanceRunning(instId), false);
});

// ------------------------------------------------------------------
// ③ 坐标校验与冷却共存
// ------------------------------------------------------------------

test("③ 位置通过但入口冷却未到 → ENTRANCE_COOLDOWN（C-Dgn-4 闸门仍在）", () => {
  bootResidentRun();
  placeNearEntrance(SEAT, USER);
  const a = enterInstance(302, [{ seatId: SEAT, userId: USER }], { lifetimeMs: 10 ** 12 });
  assert.equal(a.ok, true, "首次进入激活冷却");
  exitInstance(a.instanceRoomId!, { seatId: SEAT }); // 解散 waiting → 入口释放但冷却仍在

  // 冷却窗口内再进：坐标校验通过（入口旁），创建路径 tryEnterEntrance 拒绝 → ENTRANCE_COOLDOWN。
  placeNearEntrance(SEAT, USER);
  const res = dispatch(
    { userId: USER, connId: "c-ent-3", seatId: SEAT, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.enter", requestId: "e3", payload: { entranceId: 302 } },
  );
  assert.equal(errCode(res), "ENTRANCE_COOLDOWN", "冷却未到 → 拒绝（非 NOT_AT_ENTRANCE，位置校验已过）");

  // 冷却到期（RESIDENT world tick 推进 121+）→ 再进成功（坐标仍通过）。
  const rw = getWorld(RESIDENT_ROOM_ID)!;
  for (let i = 0; i < 121; i++) rw.step();
  placeNearEntrance(SEAT, USER);
  const res2 = dispatch(
    { userId: USER, connId: "c-ent-3b", seatId: SEAT, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.enter", requestId: "e3b", payload: { entranceId: 302 } },
  );
  assert.equal(replyOf(res2)?.type, "dungeon.enter.ok", "冷却到期后进入成功");
  exitInstance(res2.roomId as string, { seatId: SEAT });
});

// ------------------------------------------------------------------
// ④ dungeon.exit 不做坐标校验（任意位置可出；主世界内出本域边界不变）
// ------------------------------------------------------------------

test("④ dungeon.exit 无需坐标校验：主世界内出本仍 NOT_IN_INSTANCE（域边界不变）", () => {
  bootResidentRun();
  const res = dispatch(
    { userId: USER, connId: "c-ent-4", seatId: SEAT, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.exit", requestId: "x4" },
  );
  assert.equal(replyOf(res)?.type, "game.error");
  assert.equal(errCode(res), "NOT_IN_INSTANCE", "主世界内出本被拒（与位置无关）");
});

// ------------------------------------------------------------------
// ⑤ 确定性位置基线校验（C7）：ENTRANCE_INTERACT_RADIUS = 1.5×TILE
// ------------------------------------------------------------------

test("⑤ ENTRANCE_INTERACT_RADIUS 常量 = 1.5×TILE（C7）", () => {
  assert.equal(ENTRANCE_INTERACT_RADIUS, Math.round(1.5 * TILE));
  // RESPAWN_POS 仍为安全区（与入口分离，避免出生即进本）。
  assert.equal(RESPAWN_POS.x, 16 * TILE);
  assert.equal(RESPAWN_POS.y, 15 * TILE);
});
