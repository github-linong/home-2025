// Guest mode: wander is a public game and must be playable WITHOUT forcing
// login. In normal auth mode (DEV_SKIP_AUTH=false) an unauthenticated visitor
// — whether api2 is reachable-but-no-session OR api2 is down entirely — is
// given an anonymous guest identity and can join the public room.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { guestIdentity } from "../src/auth/session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

function startNormalServer(port) {
  return new Promise((resolve, reject) => {
    const srv = spawn("node", ["src/server.js"], {
      cwd: root,
      // Normal mode; point api2 at a closed port so "no login" is unambiguous
      // and exercises the api2-unreachable → guest fallback path.
      env: { ...process.env, DEV_SKIP_AUTH: "false", API2_BASE_URL: "http://127.0.0.1:1", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    srv.stderr.on("data", (d) => (out += d));
    const deadline = Date.now() + 6000;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/healthz`);
        if (r.ok) {
          clearInterval(iv);
          resolve({ srv, port });
          return;
        }
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) {
        clearInterval(iv);
        try {
          srv.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        reject(new Error("server did not start: " + out));
      }
    }, 100);
  });
}

function openGuest(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/wander`); // no devUserId
    const messages = [];
    ws.on("error", reject);
    ws.on("message", (d) => {
      try {
        messages.push(JSON.parse(d.toString()));
      } catch {
        /* ignore */
      }
    });
    ws.on("open", () =>
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
              const f = messages.find(pred);
              if (f) {
                clearInterval(iv);
                res(f);
              } else if (Date.now() - start > timeout) {
                clearInterval(iv);
                rej(new Error("timeout waiting for message"));
              }
            }, 15);
          });
        },
        close: () => ws.close(),
      }),
    );
  });
}

test("guestIdentity produces a guest user", () => {
  const g = guestIdentity();
  assert.ok(g.userId.startsWith("guest_"));
  assert.equal(g.isGuest, true);
  assert.equal(g.user.isGuest, true);
  assert.match(g.user.name, /^游客/);
});

test("unauthenticated visitor plays as guest (no forced login)", async () => {
  const port = await freePort();
  const { srv, port: p } = await startNormalServer(port);
  try {
    const c = await openGuest(p);
    const ready = await c.waitFor((m) => m.type === "session.ready");
    assert.equal(ready.isGuest, true, "unauthenticated user is a guest");
    assert.ok(ready.userId.startsWith("guest_"), "guest userId is guest_*");
    assert.equal(ready.user?.isGuest, true);
    // No AUTH_REQUIRED / close 4401 must ever be sent to a guest.
    assert.ok(!c.messages.some((m) => m.type === "game.error" && m.error?.code === "AUTH_REQUIRED"));

    c.send("room.join", { roomCode: "PUBLIC" });
    const ok = await c.waitFor((m) => m.type === "room.join.ok");
    assert.equal(ok.roomCode, "PUBLIC");
    assert.ok(ok.players.some((pl) => pl.userId === ready.userId), "guest is present in the public room");
    c.close();
  } finally {
    try {
      srv.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
});

test("api2 unreachable still yields a guest (not AUTH_REQUIRED)", async () => {
  const port = await freePort();
  const { srv, port: p } = await startNormalServer(port);
  try {
    const c = await openGuest(p);
    const ready = await c.waitFor((m) => m.type === "session.ready");
    assert.equal(ready.isGuest, true, "guest even when api2 is down");
    assert.ok(!c.messages.some((m) => m.type === "game.error" && m.error?.code === "AUTH_REQUIRED"));
    c.close();
  } finally {
    try {
      srv.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
});
