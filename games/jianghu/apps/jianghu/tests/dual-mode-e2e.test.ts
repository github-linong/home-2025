/**
 * dual-mode-e2e.test.ts — 端到端：C-Per-1 游客零持久写 + C-Per-4 last-wins + 登录加载
 */
import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startServer } from "../src/server.ts";
import { CharacterService, MemoryCharacterStore } from "../src/persistence.ts";

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

function openWs(port: number, query = ""): Promise<{ ws: WebSocket; mq: MsgQueue }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/jianghu${query}`);
    const mq = new MsgQueue(ws);
    ws.on("open", () => resolve({ ws, mq }));
    ws.on("error", reject);
  });
}

test("C-Per-1 e2e: guest writes zero to storage; refresh yields a new guestId", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  const srv = await startServer(0, { characterService: svc });
  try {
    // 游客 A（无 devUserId）
    const a = await openWs(srv.port);
    const readyA = (await a.mq.next()).data as { type: string; guest: boolean; userId: string };
    assert.equal(readyA.type, "session.ready");
    assert.equal(readyA.guest, true, "guest mode");
    const guestIdA = readyA.userId;
    assert.match(guestIdA, /^guest_/, "server guestId");
    a.ws.send(JSON.stringify({ type: "room.join", requestId: "1" }));
    await a.mq.next(); // room.join.ok
    a.ws.close();

    // 游客 B（另一次连接 → 新 guestId）
    const b = await openWs(srv.port);
    const readyB = (await b.mq.next()).data as { type: string; userId: string };
    const guestIdB = readyB.userId;
    assert.notEqual(guestIdA, guestIdB, "refresh / new guest → new random id");
    b.ws.close();

    // 断言：两个游客都零持久写
    assert.equal(await svc.exists(guestIdA), false, "guest A not persisted");
    assert.equal(await svc.exists(guestIdB), false, "guest B not persisted");
    assert.equal(store.saveCount, 0, "store.save never called for guests (C-Per-1)");
    assert.ok(!store.keys().includes(guestIdA));
  } finally {
    srv.close();
  }
});

test("C-Per-4 e2e: two connections same login userId → first is kicked (last-wins)", async () => {
  const srv = await startServer(0);
  try {
    const a = await openWs(srv.port, "?devUserId=hero");
    const readyA = (await a.mq.next()).data as { type: string; guest: boolean };
    assert.equal(readyA.guest, false);
    a.ws.send(JSON.stringify({ type: "room.join", requestId: "1" }));
    await a.mq.next(); // room.join.ok

    const b = await openWs(srv.port, "?devUserId=hero");
    const readyB = (await b.mq.next()).data as { type: string; guest: boolean };
    assert.equal(readyB.guest, false, "second device also logs in");

    // A 应收到 session.kicked（连接级 last-wins 在注册时同步踢旧）
    let kicked = false;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !kicked) {
      const m = await a.mq.next();
      if ((m.data as { type: string }).type === "session.kicked") kicked = true;
    }
    assert.ok(kicked, "old connection A was kicked by last-wins");
    b.ws.close();
  } finally {
    srv.close();
  }
});

test("login e2e: devUserId loads/creates character; session.ready carries guest:false + seatId", async () => {
  const srv = await startServer(0);
  try {
    const a = await openWs(srv.port, "?devUserId=knight");
    const ready = (await a.mq.next()).data as { type: string; guest: boolean; seatId: number };
    assert.equal(ready.type, "session.ready");
    assert.equal(ready.guest, false, "login mode");
    assert.ok(ready.seatId >= 1, "seatId assigned (seat/player mapping, E2 #1)");
    a.ws.close();
  } finally {
    srv.close();
  }
});
