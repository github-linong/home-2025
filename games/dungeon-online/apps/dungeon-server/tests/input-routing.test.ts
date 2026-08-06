/**
 * input-routing.test.ts — E4 输入路由端到端（真实 ws，headless 测试客户端）
 *
 * 验证（S4.1/S4.3 + C11）：
 *   客户端发 InputCmd（带 seq）→ 服务端 world 按 playerId 应用移动 →
 *   快照含该玩家位置变化 + lastProcessedSeq 回显；seq 回放/倒序包被 C11 拒。
 * 这是 E4「服务器真在按玩家路由并步进世界」的最小可玩闭环证据。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

process.env.DEV_SKIP_AUTH = "true"; // 必须在动态 import config 前设置

function openClient(port: number, devUserId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/dungeon?devUserId=${devUserId}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function send(ws: WebSocket, type: string, requestId: string, payload: Record<string, unknown>) {
  ws.send(JSON.stringify({ type, requestId, payload }));
}

function waitFor(
  ws: WebSocket,
  predicate: (m: any) => boolean,
  timeoutMs = 3000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
    const onMsg = (data: Buffer) => {
      let m: any;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return; // 二进制数据面帧（WorldSnapshot）忽略 JSON 解析
      }
      if (predicate(m)) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(m);
      }
    };
    ws.on("message", onMsg);
  });
}

function waitSnapshot(
  ws: WebSocket,
  predicate: (m: any) => boolean,
  timeoutMs = 3000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("snapshot timeout")), timeoutMs);
    const onMsg = (data: Buffer) => {
      let m: any;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return; // 数据面为 JSON→Buffer（R1 占位）；解析出快照结构即视为世界帧
      }
      if (m && Array.isArray(m.entities) && predicate(m)) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(m);
      }
    };
    ws.on("message", onMsg);
  });
}

const MOVE = 0; // InputAction.MOVE
const findPlayer = (snap: any, seat: number) =>
  snap.entities.find((e: any) => e.ownerId === seat);

test("E4 input routing: client InputCmd moves own player, echoes lastProcessedSeq, rejects reverse/replay", async () => {
  const { buildServer } = await import("../src/server.ts");
  const built = buildServer();
  const server = built.server;
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  assert.ok(port > 0);

  const a = await openClient(port, "alice");
  const b = await openClient(port, "bob");
  let roomId: string | undefined;

  try {
    // A 建房 → B 加入 → A 开局（启动 30Hz 循环）
    send(a, "room.create", "r1", { displayName: "Alice" });
    const created = await waitFor(a, (m) => m.type === "room.create.ok");
    roomId = created.roomId;
    send(b, "room.join", "r2", { roomCode: created.roomCode, displayName: "Bob" });
    await waitFor(b, (m) => m.type === "room.join.ok");
    send(a, "game.start", "r4", { roomId });
    await waitFor(a, (m) => m.type === "game.start.ok");

    // 1) A 发 seq=1 向右移动
    send(a, "input.cmd", "i1", {
      cmd: { seq: 1, tick: 0, action: MOVE, dir: { x: 1, y: 0 } },
    });
    const s1 = await waitSnapshot(
      a,
      (m) =>
        m.lastProcessedSeq &&
        m.lastProcessedSeq[0] === 1 &&
        findPlayer(m, 0).pos.x > 32 * 32,
    );
    const baseAx = findPlayer(s1, 0).pos.x;
    assert.ok(baseAx > 32 * 32, "player 0 should move right beyond center");
    // B 不应被 A 的输入移动（每玩家隔离）
    assert.equal(
      findPlayer(s1, 1).pos.x,
      32 * 32 - 64,
      "player 1 (no input) stays at spawn x",
    );

    // 2) A 跳发 seq=5（前向允许）
    send(a, "input.cmd", "i5", {
      cmd: { seq: 5, tick: 0, action: MOVE, dir: { x: 1, y: 0 } },
    });
    const s5 = await waitSnapshot(a, (m) => m.lastProcessedSeq && m.lastProcessedSeq[0] === 5);
    assert.ok(
      findPlayer(s5, 0).pos.x >= baseAx,
      "player 0 keeps moving right after seq=5",
    );

    // 3) A 发 seq=3（倒序 <5）→ C11 拒；lastProcessedSeq 仍为 5（不是 3）
    send(a, "input.cmd", "i3", {
      cmd: { seq: 3, tick: 0, action: MOVE, dir: { x: 1, y: 0 } },
    });
    // 多等几帧，若 seq=3 被错误接受 lastProcessedSeq 会变成 3；断言维持 5
    const s3 = await waitSnapshot(a, () => true, 1200);
    assert.equal(
      s3.lastProcessedSeq[0],
      5,
      "reverse/replay seq=3 must be rejected; lastSeq stays 5",
    );
  } finally {
    // 清理：停 run 循环 + 关 ws 服务 + 关 http，确保事件循环可退出。
    if (roomId) built.runManager.stopRun(roomId);
    a.close();
    b.close();
    await new Promise<void>((resolve) => built.wss.close(() => resolve()));
    await new Promise<void>((r) => server.close(() => r()));
  }
});
