import { createServer } from "node:http";
import { config } from "./config.js";
import { createGateway, kickUser, rooms } from "./ws/gateway.js";
import { readSettlement, readEvents } from "./journal/writer.js";
import { userParticipated, indexJournals } from "./journal/index.js";
import { replayHand } from "./journal/replay.js";
import { verifyWithApi2 } from "./auth/session.js";
import { matches } from "./match/runtime.js";
import { log } from "./logging/logger.js";

const stats = {
  startTime: Date.now(),
  activeRooms: () => rooms.size,
  activeMatches: () => matches.size,
};

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return null;
  }
}

async function authenticateHttp(req) {
  const cookie = req.headers.cookie ?? "";
  return verifyWithApi2(cookie);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        uptime: Date.now() - stats.startTime,
        activeRooms: stats.activeRooms(),
        activeMatches: stats.activeMatches(),
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/api/poker/hand/")) {
    const auth = await authenticateHttp(req);
    const parts = url.pathname.split("/");
    const handId = parts[4];
    const sub = parts[5];

    if (!auth) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "AUTH_REQUIRED" }));
      return;
    }

    const allowed = await userParticipated(handId, auth.userId);
    if (!allowed) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "FORBIDDEN" }));
      return;
    }

    if (req.method === "GET" && !sub) {
      const settlement = await readSettlement(handId);
      res.writeHead(settlement ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: Boolean(settlement), settlement }));
      return;
    }

    if (req.method === "GET" && sub === "events") {
      const cursor = Number(url.searchParams.get("cursor") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const data = await readEvents(handId, cursor, limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ...data }));
      return;
    }

    if (req.method === "GET" && sub === "replay") {
      const result = await replayHand(handId);
      res.writeHead(result.ok ? 200 : 422, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }
  }

  if (url.pathname === "/internal/kick" && req.method === "POST") {
    const token = req.headers["x-admin-token"];
    if (token !== config.internalAdminToken) {
      res.writeHead(403);
      res.end("FORBIDDEN");
      return;
    }
    const body = await parseBody(req);
    if (body?.userId) kickUser(body.userId, body.reason ?? "admin_kick");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

createGateway(server);

server.listen(config.port, () => {
  indexJournals().catch(() => {});
  log("info", "server_started", { port: config.port });
  console.log(`Poker realtime listening on http://127.0.0.1:${config.port}`);
});
