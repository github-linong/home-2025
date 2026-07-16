import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import WebSocket from "ws";
import { createGateway } from "../src/ws/gateway.js";

function collectMessages(ws) {
  const messages = [];
  ws.on("message", (data) => {
    try {
      messages.push(JSON.parse(String(data)));
    } catch {
      /* ignore */
    }
  });
  return messages;
}

function waitUntil(messages, predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const hit = messages.find(predicate);
      if (hit) {
        resolve(hit);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`timeout waiting for message; saw ${messages.map((m) => m.type).join(",")}`));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe("websocket integration", () => {
  /** @type {import('node:http').Server} */
  let server;
  let port;

  before(async () => {
    process.env.DEV_SKIP_AUTH = "true";
    server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    createGateway(server);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
        resolve(undefined);
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("connects and creates a room", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/poker?devUserId=dev_ws_a`);
    const messages = collectMessages(ws);

    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    const ready = await waitUntil(messages, (m) => m.type === "session.ready");
    assert.equal(ready.userId, "dev_ws_a");

    ws.send(
      JSON.stringify({
        type: "room.create",
        requestId: "req-1",
        payload: {},
      }),
    );

    const createOk = await waitUntil(messages, (m) => m.type === "room.create.ok");
    assert.ok(createOk.roomCode);

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws/poker?devUserId=dev_ws_b`);
    const messages2 = collectMessages(ws2);
    await new Promise((resolve, reject) => {
      ws2.on("open", resolve);
      ws2.on("error", reject);
    });
    await waitUntil(messages2, (m) => m.type === "session.ready");
    ws2.send(
      JSON.stringify({
        type: "room.join",
        requestId: "req-2",
        payload: { roomCode: createOk.roomCode },
      }),
    );
    const joinOk = await waitUntil(messages2, (m) => m.type === "room.join.ok");
    assert.ok(joinOk, "second user should join with distinct identity");

    ws.close();
    ws2.close();
  });

  it("buffers room.create sent immediately on open (auth race)", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/poker?devUserId=dev_race`);
    const messages = collectMessages(ws);

    await new Promise((resolve, reject) => {
      ws.on("open", () => {
        // Intentionally race the server auth/setup window.
        ws.send(
          JSON.stringify({
            type: "room.create",
            requestId: "race-1",
            payload: {},
          }),
        );
        resolve(undefined);
      });
      ws.on("error", reject);
    });

    await waitUntil(messages, (m) => m.type === "room.create.ok", 3000);
    assert.ok(
      messages.some((m) => m.type === "session.ready"),
      "expected session.ready",
    );
    assert.ok(
      messages.some((m) => m.type === "room.create.ok"),
      "early room.create must not be dropped",
    );
    ws.close();
  });

  it("owner can add bot and start after ready", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/poker?devUserId=dev_bot_owner`);
    const messages = collectMessages(ws);
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    await waitUntil(messages, (m) => m.type === "session.ready");
    ws.send(JSON.stringify({ type: "room.create", requestId: "c1", payload: {} }));
    const created = await waitUntil(messages, (m) => m.type === "room.create.ok");
    ws.send(
      JSON.stringify({
        type: "room.addBot",
        requestId: "b1",
        payload: { roomId: created.roomId },
      }),
    );
    await waitUntil(messages, (m) => m.type === "room.addBot.ok");
    const snap = [...messages].reverse().find((m) => m.type === "room.snapshot");
    assert.ok(snap.seats.some((s) => s.isBot));
    assert.equal(snap.seats.length, 9);
    ws.send(
      JSON.stringify({
        type: "game.ready",
        requestId: "r1",
        payload: { roomId: created.roomId, ready: true },
      }),
    );
    await waitUntil(messages, (m) => m.type === "game.ready.ok");
    ws.send(
      JSON.stringify({
        type: "game.start",
        requestId: "s1",
        payload: { roomId: created.roomId },
      }),
    );
    await waitUntil(messages, (m) => m.type === "game.start.ok", 3000);
    ws.close();
  });
});
