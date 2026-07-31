// Integration test: spin up the real WS server and exercise the protocol with
// two clients (dev auth via ?devUserId). Must set env before importing config.
process.env.DEV_SKIP_AUTH = "true";
process.env.PORT = "0"; // unused; we listen on a random port ourselves

import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

// config reads env at module load, so createServer must be imported *after*
// DEV_SKIP_AUTH is set (dynamic import inside startServer).
function startServer() {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    import("../src/server.js").then(({ createServer }) => {
      const server = createServer();
      server.listen(0, () => {
        const addr = server.address();
        resolve({ server, port: addr.port });
      });
    });
  });
}

function openClient(port, devUserId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/wander?devUserId=${devUserId}`);
    const messages = [];
    ws.on("error", reject);
    ws.on("message", (d) => {
      try {
        messages.push(JSON.parse(d.toString()));
      } catch {
        /* ignore */
      }
    });
    ws.on("open", () => {
      resolve({
        ws,
        messages,
        send(type, payload = {}) {
          ws.send(JSON.stringify({ type, payload, requestId: "r_" + Math.random().toString(36).slice(2) }));
        },
        waitFor(pred, timeout = 3000) {
          return new Promise((res, rej) => {
            const start = Date.now();
            const iv = setInterval(() => {
              const found = messages.find(pred);
              if (found) {
                clearInterval(iv);
                res(found);
              } else if (Date.now() - start > timeout) {
                clearInterval(iv);
                rej(new Error("timeout waiting for message"));
              }
            }, 15);
          });
        },
        close: () => ws.close(),
      });
    });
  });
}

test("two clients: create → join → move broadcast → resize → leave", async () => {
  const { server, port } = await startServer();
  try {
    const a = await openClient(port, "alice");
    const b = await openClient(port, "bob");
    await a.waitFor((m) => m.type === "session.ready");
    await b.waitFor((m) => m.type === "session.ready");

    // Alice creates the room.
    a.send("room.create");
    const aOk = await a.waitFor((m) => m.type === "room.create.ok");
    const code = aOk.roomCode;
    assert.ok(code, "got a room code");
    assert.equal(aOk.ownerId, "alice");

    // Bob joins by code.
    b.send("room.join", { roomCode: code });
    const bOk = await b.waitFor((m) => m.type === "room.join.ok");
    assert.equal(bOk.roomCode, code);
    assert.equal(bOk.players.length, 2);

    // Alice moves right; Bob must receive a snapshot reflecting it.
    const beforeX = aOk.player.x;
    a.send("player.move", { dir: "right" });
    const snap = await b.waitFor(
      (m) => m.type === "room.snapshot" && m.players.some((p) => p.userId === "alice" && p.x === beforeX + 1),
    );
    assert.ok(snap, "Bob saw Alice's move");

    // Owner enlarges the world; both clients observe the new bounds.
    a.send("world.resize", { w: 2000, h: 1500 });
    const resized = await a.waitFor((m) => m.type === "world.resized");
    assert.equal(resized.world.w, 2000);
    await b.waitFor((m) => m.type === "room.snapshot" && m.world.w === 2000);

    // Bob leaves; Alice sees the room shrink to one player.
    b.send("room.leave");
    await b.waitFor((m) => m.type === "room.leave.ok");
    const snap2 = await a.waitFor((m) => m.type === "room.snapshot" && m.players.length === 1);
    assert.ok(snap2);

    a.close();
    b.close();
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("joining the public room lands users in the same shared room", async () => {
  const { server, port } = await startServer();
  try {
    const c = await openClient(port, "dora");
    await c.waitFor((m) => m.type === "session.ready");
    const ready = c.messages.find((m) => m.type === "session.ready");
    assert.equal(ready.publicRoomCode, "PUBLIC");

    // First joiner auto-creates the public room.
    c.send("room.join", { roomCode: "PUBLIC" });
    const ok = await c.waitFor((m) => m.type === "room.join.ok");
    assert.equal(ok.roomCode, "PUBLIC");
    assert.equal(ok.players.length, 1);

    // A second user joining PUBLIC lands in the SAME room.
    const d = await openClient(port, "eve");
    await d.waitFor((m) => m.type === "session.ready");
    d.send("room.join", { roomCode: "PUBLIC" });
    const ok2 = await d.waitFor((m) => m.type === "room.join.ok");
    assert.equal(ok2.roomId, ok.roomId);
    assert.equal(ok2.players.length, 2);

    c.close();
    d.close();
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("joining a non-existent room returns ROOM_NOT_FOUND", async () => {
  const { server, port } = await startServer();
  try {
    const c = await openClient(port, "carol");
    await c.waitFor((m) => m.type === "session.ready");
    c.send("room.join", { roomCode: "ZZZZZZ" });
    const err = await c.waitFor((m) => m.type === "game.error" && m.error.code === "ROOM_NOT_FOUND");
    assert.ok(err);
    c.close();
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("healthz responds ok", async () => {
  const { server, port } = await startServer();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "wander");
  } finally {
    await new Promise((r) => server.close(r));
  }
});
