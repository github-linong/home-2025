import { createServer } from "node:http";
import { config } from "./config.js";
import { createGateway } from "./ws/gateway.js";
import * as store from "./store.js";
import { log } from "./logging/logger.js";
import { normalizeChannel, PUBLIC_GROUP, createGroup, getGroupByInviteCode, channelMemberCount } from "./chat/registry.js";
import { isValidInviteCode } from "./chat/invite.js";
import { verifyWithApi2 } from "./auth/session.js";
import { checkRateLimit } from "./rate-limit/limiter.js";

const startTime = Date.now();

const CHANNEL_RE = /^(public|group:[\w-]{1,64}|dm:[\w-]{2,64}:[\w-]{2,64})$/;

/** Read JSON body from a request; returns null on failure or if body exceeds maxBytes. */
function readJsonBody(req, maxBytes = 16384) {
  return new Promise((resolve) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

/** Extract client IP from a request, respecting x-forwarded-for. */
function reqClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "";
}

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

    // -----------------------------------------------------------------------
    // Group invite REST endpoints
    // -----------------------------------------------------------------------

    if (url.pathname === "/api/chat/group/create" && req.method === "POST") {
      // Rate limit per IP
      const ip = reqClientIp(req);
      if (!checkRateLimit(`rest:create:${ip}`, 60, 60_000)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "RATE_LIMITED" }));
        return;
      }

      // Resolve identity from cookie (or dev mode)
      const cookieHeader = req.headers.cookie ?? "";
      let ownerId;
      if (config.devSkipAuth) {
        // In dev mode, allow an explicit devUserId from query string or fall back
        // to reading ownerId from the body (mirrors WS dev identity logic).
        const devUid = url.searchParams.get("devUserId")?.trim();
        ownerId = (devUid && /^[\w-]{2,64}$/.test(devUid) && devUid) || "anonymous";
      } else {
        const verified = await verifyWithApi2(cookieHeader);
        if (!verified) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "AUTH_REQUIRED" }));
          return;
        }
        ownerId = verified.userId;
      }

      const body = await readJsonBody(req);
      const name = typeof body?.name === "string" ? body.name.slice(0, 24) : undefined;
      try {
        const { groupId, inviteCode } = createGroup(null, ownerId, { name });
        log("info", "rest_group_created", { groupId, inviteCode, ownerId });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, groupId, inviteCode }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message ?? "CREATE_FAILED" }));
      }
      return;
    }

    // GET /api/chat/group/invite/:code — validate invite code
    const inviteMatch = url.pathname.match(/^\/api\/chat\/group\/invite\/([A-Z0-9]{4,10})$/i);
    if (inviteMatch && req.method === "GET") {
      // Rate limit per IP to prevent invite-code brute-force enumeration
      const ip = reqClientIp(req);
      if (!checkRateLimit(`rest:invite:${ip}`, 60, 60_000)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "RATE_LIMITED" }));
        return;
      }
      const code = inviteMatch[1].toUpperCase();
      if (!isValidInviteCode(code)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "INVALID_INVITE" }));
        return;
      }
      const meta = getGroupByInviteCode(code);
      if (!meta) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "INVALID_INVITE" }));
        return;
      }
      const memberCount = channelMemberCount(meta.groupId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        groupId: meta.groupId,
        name: meta.name,
        memberCount,
        inviteCode: meta.inviteCode,
      }));
      return;
    }

    // POST /api/chat/group/join/:code — stub (actual join via WebSocket)
    const joinMatch = url.pathname.match(/^\/api\/chat\/group\/join\/([A-Z0-9]{4,10})$/i);
    if (joinMatch && req.method === "POST") {
      // Rate limit per IP
      const ip = reqClientIp(req);
      if (!checkRateLimit(`rest:join:${ip}`, 60, 60_000)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "RATE_LIMITED" }));
        return;
      }
      const code = joinMatch[1].toUpperCase();
      const meta = getGroupByInviteCode(code);
      if (!meta) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "INVALID_INVITE" }));
        return;
      }
      // Stub: tell client to use WebSocket
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, groupId: meta.groupId, via: "websocket" }));
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
  // Warm the in-memory ring buffer from MySQL (no-op / memory-mode if MYSQL_*
  // is not configured). Await so history is available before clients connect.
  store.init().finally(() => {
    server.listen(config.port, () => {
      log("info", "server_started", { port: config.port });
      console.log(`Chat realtime listening on http://127.0.0.1:${config.port}`);
    });
  });

  const shutdown = () => {
    store.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
