import { createServer } from "node:http";
import { config } from "./config.js";
import { createGateway } from "./ws/gateway.js";
import * as store from "./store.js";
import { log } from "./logging/logger.js";
import { normalizeChannel, PUBLIC_GROUP } from "./chat/registry.js";

const startTime = Date.now();

const CHANNEL_RE = /^(public|group:[\w-]{1,64}|dm:[\w-]{2,64}:[\w-]{2,64})$/;

/**
 * Build the HTTP server (REST + WS gateway) without listening. Exported so
 * tests can mount it on an ephemeral port.
 */
export function createApp() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, uptime: Date.now() - startTime, service: "chat" }));
      return;
    }

    // Recent history over REST (handy for initial load / SEO / non-WS clients).
    if (url.pathname === "/api/chat/history") {
      const reqChannel = url.searchParams.get("channel") || "public";
      const limit = Number(url.searchParams.get("limit") || 50);
      const channel = normalizeChannel(reqChannel);
      if (!CHANNEL_RE.test(channel)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "INVALID_CHANNEL" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, channel, messages: store.getHistory(channel, Math.min(limit, 200)) }));
      return;
    }

    if (url.pathname === "/internal/kick" && req.method === "POST") {
      const token = req.headers["x-admin-token"];
      if (token !== config.internalAdminToken) {
        res.writeHead(403);
        res.end("FORBIDDEN");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  createGateway(server);
  return server;
}

// When run directly, start listening.
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createApp();
  server.listen(config.port, () => {
    log("info", "server_started", { port: config.port });
    console.log(`Chat realtime listening on http://127.0.0.1:${config.port}`);
  });
}
