import http from "node:http";
import { config } from "./config.js";
import { createGateway } from "./ws/gateway.js";
import { sweepIdleEmptyRooms } from "./lobby/lobby-service.js";

export function createServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "wander", ts: Date.now() }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
  });

  // Attach the WebSocket gateway (path: /ws/wander).
  createGateway(server);
  return server;
}

// Idle GC ticker (no-op when run under tests that only import createServer).
function startIdleGc() {
  setInterval(() => {
    try {
      sweepIdleEmptyRooms();
    } catch {
      /* ignore */
    }
  }, 60_000).unref?.();
}

// Only boot the listener when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(config.port, () => {
    console.log(`[wander] listening on :${config.port} (ws path /ws/wander)`);
  });
  startIdleGc();
}
