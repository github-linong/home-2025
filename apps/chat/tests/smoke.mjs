/**
 * Plain smoke runner (no node:test) — used to validate chat routing logic in
 * environments where `node --test` misbehaves. Run: `node tests/smoke.mjs`
 */
import { WebSocket } from "ws";
import { createApp } from "../src/server.js";
import { config } from "../src/config.js";

// ESM hoists the `config.js` import above any `process.env.*` assignment, so we
// can't rely on DEV_SKIP_AUTH env here — set the shared flag directly. This makes
// `?devUserId=` resolve to a stable dev identity without a running api2.
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
    } catch {}
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
      } catch {}
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
        const t = setTimeout(() => reject(new Error("waitFor timeout: " + pred)), ms);
        const handler = (raw) => {
          try {
            const m = JSON.parse(String(raw));
            received.push(m);
            if (pred(m)) {
              clearTimeout(t);
              ws.off("message", handler);
              resolve(m);
            }
          } catch {}
        };
        ws.on("message", handler);
      }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log("  PASS:", msg);
  } else {
    failures++;
    console.log("  FAIL:", msg);
  }
}

async function main() {
  // 1. public broadcast
  {
    console.log("[public broadcast]");
    const server = await startServer();
    const port = server.address().port;
    const a = openClient(port, "alice");
    const b = openClient(port, "bob");
    await Promise.all([a.ready, b.ready]);
    a.send("chat.message", { channel: "public", text: "hello world", clientMsgId: "c1" });
    const got = await b.waitFor((m) => m.type === "chat.message" && m.text === "hello world");
    check(got.author.userId === "alice", "author is alice");
    check(got.channel === "group:public", "channel is group:public");
    const ack = a.received.find((m) => m.type === "chat.ack" && m.clientMsgId === "c1");
    check(!!ack, "sender got ack");
    a.ws.close();
    b.ws.close();
    await sleep(50);
    server.close();
  }

  // 2. DM privacy
  {
    console.log("[DM privacy]");
    const server = await startServer();
    const port = server.address().port;
    const a = openClient(port, "alice");
    const b = openClient(port, "bob");
    const c = openClient(port, "carol");
    await Promise.all([a.ready, b.ready, c.ready]);
    a.send("chat.message", { channel: "dm:bob", text: "secret", clientMsgId: "d1" });
    const gotB = await b.waitFor((m) => m.type === "chat.message" && m.text === "secret");
    check(gotB.channel === "dm:alice:bob", "dm channel canonicalized");
    await sleep(150);
    check(c.received.find((m) => m.type === "chat.message") === undefined, "third party did NOT receive DM");
    a.send("chat.message", { channel: "dm:alice", text: "nope" });
    const err = await a.waitFor((m) => m.type === "chat.error" && m.code === "SELF_DM");
    check(!!err, "self-DM rejected");
    a.ws.close();
    b.ws.close();
    c.ws.close();
    await sleep(50);
    server.close();
  }

  // 3. group join
  {
    console.log("[group join]");
    const server = await startServer();
    const port = server.address().port;
    const a = openClient(port, "alice");
    const b = openClient(port, "bob");
    await Promise.all([a.ready, b.ready]);
    a.send("chat.message", { channel: "group:room-123", text: "in the room" });
    await sleep(150);
    check(b.received.find((m) => m.type === "chat.message" && m.channel === "group:room-123") === undefined, "non-member did not receive");
    b.send("chat.join", { channel: "group:room-123" });
    await b.waitFor((m) => m.type === "chat.joined" && m.channel === "group:room-123");
    a.send("chat.message", { channel: "group:room-123", text: "now bob is here" });
    const got = await b.waitFor((m) => m.type === "chat.message" && m.text === "now bob is here");
    check(!!got, "member received after join");
    a.ws.close();
    b.ws.close();
    await sleep(50);
    server.close();
  }

  // 4. history REST
  {
    console.log("[history REST]");
    const server = await startServer();
    const port = server.address().port;
    const a = openClient(port, "alice");
    await a.ready;
    a.send("chat.message", { channel: "public", text: "historic" });
    await a.waitFor((m) => m.type === "chat.message" && m.text === "historic");
    await sleep(100);
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/history?channel=public&limit=10`);
    const body = await res.json();
    check(body.ok === true, "history ok");
    check(body.messages.some((m) => m.text === "historic"), "history contains message");
    a.ws.close();
    server.close();
  }

  // 5. rejection cases
  {
    console.log("[rejections]");
    const server = await startServer();
    const port = server.address().port;
    const a = openClient(port, "alice");
    await a.ready;
    a.send("chat.message", { channel: "public", text: "   " });
    const e1 = await a.waitFor((m) => m.type === "chat.error" && m.code === "EMPTY_MESSAGE");
    check(!!e1, "empty message rejected");
    a.send("chat.message", { channel: "bogus://x", text: "hi" });
    const e2 = await a.waitFor((m) => m.type === "chat.error" && m.code === "INVALID_CHANNEL");
    check(!!e2, "bogus channel rejected");
    a.ws.close();
    server.close();
  }

  console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE ERROR", e);
  process.exit(1);
});
