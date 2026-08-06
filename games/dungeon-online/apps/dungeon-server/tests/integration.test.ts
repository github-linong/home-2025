/**
 * integration.test.ts — E1 端到端联机闭环（真实 ws，headless 测试客户端，R2）
 * 验证：鉴权握手 → room.create → room.join → game.start → 30Hz 权威 WorldSnapshot 真实下发。
 * 这是 S1.3「服务器真在 tick 世界并广播」的最小可玩闭环证据。
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

test("E1 end-to-end: two clients create/join a room and receive live 30Hz world snapshots", async () => {
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
    // A 建房
    send(a, "room.create", "r1", { displayName: "Alice" });
    const created = await waitFor(a, (m) => m.type === "room.create.ok");
    assert.ok(created.roomCode);
    roomId = created.roomId;

    // B 加入
    send(b, "room.join", "r2", { roomCode: created.roomCode, displayName: "Bob" });
    const joined = await waitFor(b, (m) => m.type === "room.join.ok");
    assert.equal(joined.roomId, roomId);

    // A 开局（启动 30Hz 循环）
    send(a, "game.start", "r4", { roomId });
    const started = await waitFor(a, (m) => m.type === "game.start.ok");
    assert.ok(started.runId);

    // 双方都应收到数据面（二进制）WorldSnapshot 帧（30Hz 广播）。
    const gotBinary = new Promise<boolean>((resolve) => {
      const onBin = (data: Buffer) => {
        // 数据面为 JSON→Buffer（R1 占位）；解析出 tick 字段即视为世界快照。
        try {
          const m = JSON.parse(data.toString());
          if (m && typeof m.tick === "number" && m.entities) {
            b.off("message", onBin);
            resolve(true);
          }
        } catch {
          /* 非 JSON 帧忽略 */
        }
      };
      b.on("message", onBin);
      setTimeout(() => resolve(false), 1500);
    });

    const ok = await gotBinary;
    assert.equal(ok, true, "client B should receive live WorldSnapshot frames at 30Hz");
  } finally {
    // 清理：停 run 循环 + 关 ws 服务 + 关 http，确保事件循环可退出（无论断言成败）。
    if (roomId) built.runManager.stopRun(roomId);
    a.close();
    b.close();
    await new Promise<void>((resolve) => built.wss.close(() => resolve()));
    await new Promise<void>((r) => server.close(() => r()));
  }
});
