/**
 * d8-disconnect-wiring.test.ts — D8 断线托管接线端到端验证（服务端层，无需真实 socket）
 *
 * 驱动 run-manager + room-service 直接验证（关闭 E7 QA 计划 §2 DEFER #1 / design-review O-D7）：
 *   - markDisconnected(room, userId) → world.setDisconnected(seatIndex, true)
 *     （三者同发：跳过 tick + 暂停 DOWNED/救援计时 + 抓拍 PersonalState）。
 *   - validateReconnect(room, userId, seatIndex, token, runId) → world.setDisconnected(seatIndex, false)
 *     （恢复推进，计时从剩余窗口续算，无跳变）。
 *   - 另一玩家 B 不受影响。
 *
 * 映射：房间座位 seatIndex === World 玩家 id（actor.ownerId，见 protocol.ts game.start），
 *       故断开/重连以 seatIndex 驱动 world.setDisconnected。
 *
 * 运行：node --experimental-strip-types --test tests/d8-disconnect-wiring.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createRunManager } from "../src/run-manager.ts";
import {
  createRoom,
  lockSeat,
  confirmSeat,
  markDisconnected,
  validateReconnect,
  setWorldResolver,
  type Room,
} from "../src/room-service.ts";
import { PLAYER_CLASSES } from "../../../packages/sim-core/src/types.ts";
import type { World } from "../../../packages/sim-core/src/world.ts";

/** 在好友房依次落座并确认 N 名玩家（seatIndex === userId 下标）。 */
function seatedRoom(users: string[]): Room {
  const room = createRoom(users[0], users[0]);
  users.forEach((u, i) => {
    lockSeat(room, u, i);
    confirmSeat(room, u, u, i);
  });
  return room;
}

test("D8: 断线→world.setDisconnected(true) 且重连→(false)，另一玩家不受影响（端到端）", () => {
  const runManager = createRunManager();
  const room = seatedRoom(["A", "B"]);
  // 桥接：room-service 的托管钩子解析到本 run 的权威 World。
  setWorldResolver((roomId) => runManager.getWorld(roomId));

  // 启动带 2 名玩家的 run（seatId === seatIndex === 0/1，镜像 protocol.ts game.start）。
  runManager.startRun(room.roomId, {
    runId: "run_d8",
    seed: "D8-SEED",
    biomeId: 0,
    players: [
      { seatId: 0, userId: "A", classId: PLAYER_CLASSES[0] },
      { seatId: 1, userId: "B", classId: PLAYER_CLASSES[1 % PLAYER_CLASSES.length] },
    ],
  });
  room.runId = "run_d8";

  const world = runManager.getWorld(room.roomId) as World;
  assert.ok(world, "run World created");

  // 间谍：包裹 setDisconnected 记录调用并透传到真实实现（证明 hook 被真实触发，非橡皮图章）。
  const calls: Array<{ playerId: number; disconnected: boolean }> = [];
  const original = world.setDisconnected.bind(world);
  world.setDisconnected = (playerId: number, disconnected: boolean) => {
    calls.push({ playerId, disconnected });
    original(playerId, disconnected);
  };

  // 预推进若干 tick，确认 A/B 初始均为 connected。
  for (let i = 0; i < 3; i++) world.step();
  assert.equal(world.actors().find((a) => a.ownerId === 0)!.disconnected, false, "A initially connected");
  assert.equal(world.actors().find((a) => a.ownerId === 1)!.disconnected, false, "B initially connected");

  // ── 断开 A（socket 关闭路径：gateway 调 markDisconnected(room, userId)）──
  markDisconnected(room, "A");

  // ① hook 以 (seatIndexA=0, true) 被调用。
  assert.ok(
    calls.some((c) => c.playerId === 0 && c.disconnected === true),
    "markDisconnected must invoke world.setDisconnected(0, true) for player A",
  );
  // ② World 内 A 实体进入托管（disconnected===true，由 setDisconnected 单一写入）。
  assert.equal(
    world.actors().find((a) => a.ownerId === 0)!.disconnected,
    true,
    "player A actor disconnected === true in authoritative World",
  );
  // ③ 玩家 B 不受影响。
  assert.equal(
    world.actors().find((a) => a.ownerId === 1)!.disconnected,
    false,
    "player B unaffected by A disconnect (still connected)",
  );

  // ── 重连 A（使用断开前 confirmSeat 下发的 reconnectToken；validateReconnect 会轮换）──
  const token = room.seats[0].reconnectToken!;
  const result = validateReconnect(room, "A", 0, token, room.runId);
  assert.match(result.reconnectToken, /^[0-9a-f]{64}$/, "reconnect re-issues token");

  // ④ hook 以 (0, false) 被调用 → 恢复推进（无跳变）。
  assert.ok(
    calls.some((c) => c.playerId === 0 && c.disconnected === false),
    "validateReconnect must invoke world.setDisconnected(0, false) for player A",
  );
  // ⑤ World 内 A 实体恢复 connected（disconnected===false）。
  assert.equal(
    world.actors().find((a) => a.ownerId === 0)!.disconnected,
    false,
    "player A resumed (disconnected === false), no jump",
  );
  // ⑥ B 始终不受影响。
  assert.equal(
    world.actors().find((a) => a.ownerId === 1)!.disconnected,
    false,
    "player B still unaffected after A reconnect",
  );

  // 防御：未注入 resolver 时 markDisconnected 不抛错（还原全局状态，避免污染其他测试文件）。
  setWorldResolver(null);
});
