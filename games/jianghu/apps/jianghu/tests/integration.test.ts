/**
 * integration.test.ts — 端到端：起服务 → 连接 → 加入 RESIDENT → 收双平面消息（C3/C4/C5）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startServer } from "../src/server.ts";
import { decodeSnapshot } from "../src/protocol-binary.ts";
import { EntityKind } from "../sim-core/src/types.ts";

/** 缓冲消息队列：连接创建即挂监听，避免 session.ready 在 open 与监听注册之间丢失的竞态。 */
class MsgQueue {
  private ws: WebSocket;
  private q: { kind: "text" | "binary"; data: unknown }[] = [];
  private waiters: ((m: { kind: "text" | "binary"; data: unknown }) => void)[] = [];
  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (raw: Buffer, isBinary: boolean) => {
      const m = isBinary
        ? { kind: "binary" as const, data: raw }
        : { kind: "text" as const, data: JSON.parse(raw.toString()) };
      const w = this.waiters.shift();
      if (w) w(m);
      else this.q.push(m);
    });
  }
  next(): Promise<{ kind: "text" | "binary"; data: unknown }> {
    const buffered = this.q.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

function openWs(port: number, devUserId = "itest"): Promise<{ ws: WebSocket; mq: MsgQueue }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/jianghu?devUserId=${devUserId}`);
    const mq = new MsgQueue(ws);
    ws.on("open", () => resolve({ ws, mq }));
    ws.on("error", reject);
  });
}

test("E2E: client connects, joins RESIDENT, receives control + binary data (C3/C4/C5)", async () => {
  const srv = await startServer(0);
  const port = srv.port;
  try {
    const { ws, mq } = await openWs(port, "hero");

    // 1) session.ready 控制面（显式 type，C4）。
    const ready = (await mq.next()).data as { type: string; tickRate: number };
    assert.equal(ready.type, "session.ready");
    assert.equal(ready.tickRate, 12, "tickRate from sim-core single source (C1)");

    // 2) 加入 RESIDENT（控制面 dispatch，显式 type）。
    ws.send(JSON.stringify({ type: "room.join", requestId: "1" }));
    const joinOk = (await mq.next()).data as { type: string; roomId: string; reconnectToken: string };
    assert.equal(joinOk.type, "room.join.ok");
    assert.ok(joinOk.reconnectToken, "reconnect token issued (chat model)");
    assert.equal(joinOk.roomId, "room_resident_public");

    // 3) 房间 presence 广播（控制面 room.snapshot）。
    const snap = (await mq.next()).data as { type: string };
    assert.equal(snap.type, "room.snapshot");

    // 4) 数据面二进制快照（12Hz，帧首 0x01，C3/C4）。
    let binaryFrame: Buffer | null = null;
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline && !binaryFrame) {
      const msg = await mq.next();
      if (msg.kind === "binary") binaryFrame = msg.data as Buffer;
    }
    assert.ok(binaryFrame, "should receive at least one binary snapshot frame");
    assert.equal(binaryFrame![0], 0x01, "binary frame msgType = SNAPSHOT (C4 explicit)");

    // 5) 数据面输入摄取不崩溃（C6 纪律 B 解耦）。
    ws.send(
      JSON.stringify({
        type: "input.cmd",
        payload: { cmd: { seq: 1, tick: 0, action: 0, dir: 0 } },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));

    ws.close();
  } finally {
    srv.close();
  }
});

/** 等一个含敌人/BOSS 的实例二进制帧（解码断言，确认收到的是实例域快照）。 */
async function nextInstanceFrame(mq: MsgQueue, deadlineMs = 2000): Promise<Buffer | null> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const msg = await mq.next();
    if (msg.kind !== "binary") continue;
    const snap = decodeSnapshot(msg.data as Buffer);
    const kinds = snap.entities.map((e) => e.kind);
    if (kinds.includes(EntityKind.ENEMY) || kinds.includes(EntityKind.BOSS)) return msg.data as Buffer;
  }
  return null;
}

test("E2E C10: enter instance → disconnect → reconnect within lifetime restores instance subscription (no jump)", async () => {
  const srv = await startServer(0);
  const port = srv.port;
  try {
    // 1) 首连：加入 RESIDENT → 拿重连 token。
    const { ws: ws1, mq: mq1 } = await openWs(port, "c10hero");
    const ready1 = (await mq1.next()).data as { type: string };
    assert.equal(ready1.type, "session.ready");
    ws1.send(JSON.stringify({ type: "room.join", requestId: "c10-1" }));
    const joinOk = (await mq1.next()).data as { type: string; roomId: string; reconnectToken: string };
    assert.equal(joinOk.type, "room.join.ok");
    assert.equal(joinOk.roomId, "room_resident_public");
    const residentToken = joinOk.reconnectToken;

    // 2) 进入副本：dungeon.enter → 得到 instance roomId + 副本重连 token。
    ws1.send(JSON.stringify({ type: "dungeon.enter", requestId: "c10-2", payload: { entranceId: 1 } }));
    let enterOk = (await mq1.next()).data as { type: string; roomId: string; reconnectToken?: string };
    while (enterOk.type !== "dungeon.enter.ok") enterOk = (await mq1.next()).data as typeof enterOk;
    assert.equal(enterOk.type, "dungeon.enter.ok");
    const instId = enterOk.roomId;
    assert.ok(instId && instId !== "room_resident_public", "entered instance room");
    assert.ok(enterOk.reconnectToken, "instance reconnect token issued");

    // 3) 收到实例二进制帧（含敌人/BOSS，确认已切到副本域）。
    const instFrame = await nextInstanceFrame(mq1);
    assert.ok(instFrame, "should receive instance binary frames (with enemies) after entering");
    assert.equal(instFrame![0], 0x01, "binary frame msgType = SNAPSHOT");

    // 4) 断线（关闭 ws1）。
    ws1.close();

    // 5) 重连（同账号）：session.reconnect → 恢复实例订阅（C10 无跳变：仍回副本）。
    const { ws: ws2, mq: mq2 } = await openWs(port, "c10hero");
    const ready2 = (await mq2.next()).data as { type: string };
    assert.equal(ready2.type, "session.ready");
    ws2.send(
      JSON.stringify({
        type: "session.reconnect",
        requestId: "c10-3",
        payload: { roomId: instId, reconnectToken: enterOk.reconnectToken ?? residentToken },
      }),
    );
    let recOk = (await mq2.next()).data as { type: string; roomId: string; fellBackToResident?: boolean };
    while (recOk.type !== "session.reconnect.ok") recOk = (await mq2.next()).data as typeof recOk;
    assert.equal(recOk.type, "session.reconnect.ok");
    assert.equal(recOk.roomId, instId, "C10: reconnect restores instance subscription (no jump to resident)");
    assert.notEqual(recOk.fellBackToResident, true, "no fallback while instance alive");

    // 6) 重连后仍收实例二进制帧（副本态保留分离还原）。
    const instFrame2 = await nextInstanceFrame(mq2);
    assert.ok(instFrame2, "should receive instance frames again after reconnect");

    ws2.close();
  } finally {
    srv.close();
  }
});
