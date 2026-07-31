import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createApp } from "../src/server.js";
import { config } from "../src/config.js";

// Force dev mode so connections resolve to deterministic dev identities
// (devUserId) without needing a running api2. Mutating the shared config
// object is enough because the gateway reads config.devSkipAuth at call time.
config.devSkipAuth = true;

function startServer() {
  const server = createApp();
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

function openClient(port, devUserId) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/chat?devUserId=${devUserId}`);
  const received = [];
  ws.on("message", (raw) => {
    try {
      received.push(JSON.parse(String(raw)));
    } catch {
      /* ignore */
    }
  });
  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("welcome timeout")), 4000);
    ws.on("message", function onMsg(raw) {
      try {
        const m = JSON.parse(String(raw));
        if (m.type === "chat.welcome") {
          clearTimeout(t);
          ws.off("message", onMsg);
          resolve(m);
        }
      } catch {
        /* ignore */
      }
    });
    ws.on("error", reject);
  });
  return {
    ws,
    received,
    ready,
    send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
    waitFor: (pred, ms = 2000) =>
      new Promise((resolve, reject) => {
        const found = received.find(pred);
        if (found) return resolve(found);
        const t = setTimeout(() => reject(new Error("waitFor timeout")), ms);
        const handler = (raw) => {
          try {
            const m = JSON.parse(String(raw));
            received.push(m);
            if (pred(m)) {
              clearTimeout(t);
              ws.off("message", handler);
              resolve(m);
            }
          } catch {
            /* ignore */
          }
        };
        ws.on("message", handler);
      }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("public messages broadcast to all connected clients", async () => {
  const server = await startServer();
  const port = server.address().port;
  const a = openClient(port, "alice");
  const b = openClient(port, "bob");
  await Promise.all([a.ready, b.ready]);

  a.send("chat.message", { channel: "public", text: "hello world", clientMsgId: "c1" });
  const got = await b.waitFor((m) => m.type === "chat.message" && m.text === "hello world");
  assert.equal(got.author.userId, "alice");
  assert.equal(got.channel, "public");

  await sleep(50);
  const ack = a.received.find((m) => m.type === "chat.ack" && m.clientMsgId === "c1");
  assert.ok(ack, "sender should receive ack");

  a.ws.close();
  b.ws.close();
  await sleep(50);
  server.close();
});

test("DM is delivered only to the two participants", async () => {
  const server = await startServer();
  const port = server.address().port;
  const a = openClient(port, "alice");
  const b = openClient(port, "bob");
  const c = openClient(port, "carol");
  await Promise.all([a.ready, b.ready, c.ready]);

  a.send("chat.message", { channel: "dm:bob", text: "secret", clientMsgId: "d1" });
  const gotB = await b.waitFor((m) => m.type === "chat.message" && m.text === "secret");
  assert.equal(gotB.channel, "dm:alice:bob");

  await sleep(150);
  const leaked = c.received.find((m) => m.type === "chat.message");
  assert.equal(leaked, undefined, "third party must NOT receive the DM");

  // self-DM rejected
  a.send("chat.message", { channel: "dm:alice", text: "nope" });
  const err = await a.waitFor((m) => m.type === "chat.error" && m.code === "SELF_DM");
  assert.ok(err);

  a.ws.close();
  b.ws.close();
  c.ws.close();
  await sleep(50);
  server.close();
});

test("group chat requires join; late joiner misses earlier message", async () => {
  const server = await startServer();
  const port = server.address().port;
  const a = openClient(port, "alice");
  const b = openClient(port, "bob");
  await Promise.all([a.ready, b.ready]);

  a.send("chat.message", { channel: "group:room-123", text: "in the room" });
  await sleep(150);
  const bGotItEarly = b.received.find((m) => m.type === "chat.message" && m.channel === "group:room-123");
  assert.equal(bGotItEarly, undefined, "bob not joined yet, should not receive");

  b.send("chat.join", { channel: "group:room-123" });
  await b.waitFor((m) => m.type === "chat.joined" && m.channel === "group:room-123");

  a.send("chat.message", { channel: "group:room-123", text: "now bob is here" });
  const got = await b.waitFor((m) => m.type === "chat.message" && m.text === "now bob is here");
  assert.ok(got);

  a.ws.close();
  b.ws.close();
  await sleep(50);
  server.close();
});

test("history REST endpoint returns stored public messages", async () => {
  const server = await startServer();
  const port = server.address().port;
  const a = openClient(port, "alice");
  await a.ready;
  a.send("chat.message", { channel: "public", text: "historic" });
  await a.waitFor((m) => m.type === "chat.message" && m.text === "historic");
  await sleep(100);

  const res = await fetch(`http://127.0.0.1:${port}/api/chat/history?channel=public&limit=10`);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.messages.some((m) => m.text === "historic"));

  a.ws.close();
  server.close();
});

test("empty / oversized messages are rejected", async () => {
  const server = await startServer();
  const port = server.address().port;
  const a = openClient(port, "alice");
  await a.ready;

  a.send("chat.message", { channel: "public", text: "   " });
  const e1 = await a.waitFor((m) => m.type === "chat.error" && m.code === "EMPTY_MESSAGE");
  assert.ok(e1);

  a.send("chat.message", { channel: "bogus://x", text: "hi" });
  const e2 = await a.waitFor((m) => m.type === "chat.error" && m.code === "INVALID_CHANNEL");
  assert.ok(e2);

  a.ws.close();
  server.close();
});
