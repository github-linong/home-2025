import { WebSocketServer } from "ws";
import { config } from "../config.js";
import {
  verifyWithApi2,
  setSession,
  deleteSession,
  shouldRevalidate,
  revalidateSession,
} from "../auth/session.js";
import * as registry from "../ws/connection-registry.js";
import {
  setRoomChangeListener,
  getRoom,
  getRoomByCode,
  createRoom,
  joinRoom,
  leaveRoom,
  movePlayer,
  resizeWorld,
  roomSnapshot,
  validateReconnect,
  markDisconnected,
} from "../lobby/lobby-service.js";

function clientIp(req) {
  const xff = req?.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req?.socket?.remoteAddress ?? "unknown";
}

function errorMsg(code, message) {
  return {
    type: "game.error",
    error: { code, message: message ?? code, retryable: code === "RATE_LIMITED" },
  };
}

export function createGateway(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws/wander",
    maxPayload: config.maxMessageBytes,
  });

  // The lobby notifies us of any presence/movement change; we broadcast a full
  // snapshot to everyone in the room (the user's chosen "broadcast-all" model).
  setRoomChangeListener((room) => {
    registry.broadcastToRoom(room, roomSnapshot(room));
  });

  wss.on("connection", (ws, req) => {
    ws._authed = false;
    ws._lastPong = Date.now();
    ws._pendingRaw = [];
    const ip = clientIp(req);
    const url = new URL(req.url ?? "/", "http://localhost");
    const devUserId = url.searchParams.get("devUserId") ?? null;
    const cookie = req.headers.cookie ?? null;

    ws.on("pong", () => {
      ws._lastPong = Date.now();
    });

    ws.on("message", async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!ws._authed) {
        // Auth runs on connect; buffer everything that arrives until it's done.
        ws._pendingRaw.push(msg);
        if (ws._pendingRaw.length > 50) ws._pendingRaw.shift();
        return;
      }
      await dispatchMessage(ws, msg, { ip, cookie });
    });

    ws.on("close", () => onClose(ws));
    ws.on("error", () => {
      /* ignore transport errors */
    });

    // Heartbeat: ping periodically, drop connections that stop replying.
    ws._pingTimer = setInterval(() => {
      if (!ws._authed) return;
      if (Date.now() - ws._lastPong > config.pongTimeoutMs) {
        const conn = registry.getConnection(ws._connId);
        if (conn?.roomId) {
          const room = getRoom(conn.roomId);
          if (room) markDisconnected(room, conn.userId);
        }
        try {
          ws.close(4000, "ping_timeout");
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }, config.pingIntervalMs);
    ws._pingTimer.unref?.();

    // Authenticate immediately on connect (dev auth via query/cookie, or api2).
    authenticate(ws, { ip, devUserId, cookie }).catch(() => {});
  });

  return wss;
}

async function authenticate(ws, ctx) {
  const verified = await verifyWithApi2(ctx.cookie, { devUserId: ctx.devUserId });
  if (!verified) {
    try {
      ws.send(
        JSON.stringify({
          type: "game.error",
          error: { code: "AUTH_REQUIRED", message: "请先登录", retryable: false },
        }),
      );
      ws.close(4401, "auth_required");
    } catch {
      /* ignore */
    }
    return;
  }

  const connId = registry.registerConnection(ws, verified.userId, ctx.cookie ?? "");
  ws._connId = connId;
  ws._authed = true;
  setSession(connId, { userId: verified.userId, user: verified.user, cookie: ctx.cookie });

  ws.send(
    JSON.stringify({
      type: "session.ready",
      userId: verified.userId,
      user: verified.user,
      publicRoomCode: config.publicRoomCode,
    }),
  );

  // Replay anything the client sent while auth was in flight.
  const pending = ws._pendingRaw ?? [];
  ws._pendingRaw = [];
  for (const m of pending) {
    await dispatchMessage(ws, m, { ip: ctx.ip, cookie: ctx.cookie });
  }
}

async function dispatchMessage(ws, msg, ctx) {
  const conn = registry.getConnection(ws._connId);
  if (!conn) return;

  if (msg.type === "game.ping") {
    ws.send(JSON.stringify({ type: "game.pong", t: msg.t ?? Date.now() }));
    return;
  }

  // Periodic, lightweight session re-validation on the api2 side.
  if (shouldRevalidate(ws._connId)) {
    const v = await revalidateSession(ws._connId, ctx.cookie ?? conn.cookie);
    if (!v) {
      registry.kickConnection(ws._connId, conn.userId, "session_expired");
      return;
    }
  }

  const payload = msg.payload ?? {};
  switch (msg.type) {
    case "room.create":
      return handleRoomCreate(ws, conn, payload);
    case "room.join":
      return handleRoomJoin(ws, conn, payload);
    case "room.leave":
      return handleRoomLeave(ws, conn, payload);
    case "player.move":
      return handlePlayerMove(ws, conn, payload);
    case "world.resize":
      return handleWorldResize(ws, conn, payload);
    case "sync.request":
      return handleSync(ws, conn, payload);
    case "session.reconnect":
      return handleReconnect(ws, conn, payload);
    default:
      return;
  }
}

function handleRoomCreate(ws, conn, payload) {
  const room = createRoom(conn.userId, payload.displayName ?? conn.user?.name ?? null);
  registry.setRoom(ws._connId, room.roomId);
  const player = room.players.get(conn.userId);
  registry.sendToConn(ws._connId, {
    type: "room.create.ok",
    roomId: room.roomId,
    roomCode: room.roomCode,
    ownerId: room.ownerId,
    world: { ...room.world },
    stateVersion: room.stateVersion,
    you: conn.userId,
    player: publicView(player),
    reconnectToken: player.reconnectToken,
    players: [...room.players.values()].map(publicView),
  });
  // Tell everyone else a new snapshot is available (they'll get the join ok too).
  registry.broadcastToRoom(room, roomSnapshot(room), conn.userId);
}

function handleRoomJoin(ws, conn, payload) {
  const code = String(payload.roomCode ?? "").trim().toUpperCase();
  let room = getRoomByCode(code);
  let autoCreatedForYou = false;
  if (!room) {
    // The designated public room auto-creates on first join so /wander always
    // has somewhere to land. Any other unknown code is a genuine error.
    if (code === config.publicRoomCode) {
      room = createRoom(conn.userId, payload.displayName ?? conn.user?.name ?? null, config.publicRoomCode);
      autoCreatedForYou = true;
    } else {
      registry.sendToConn(ws._connId, errorMsg("ROOM_NOT_FOUND", "房间不存在或已过期"));
      return;
    }
  }
  // When we just auto-created the room for this very user, they are already the
  // first player in it — skip joinRoom (which would reject the duplicate).
  if (!autoCreatedForYou) {
    const res = joinRoom(room, conn.userId, payload.displayName ?? conn.user?.name ?? null);
    if (res && res.code) {
      registry.sendToConn(ws._connId, errorMsg(res.code, res.message));
      return;
    }
  }
  registry.setRoom(ws._connId, room.roomId);
  const player = room.players.get(conn.userId);
  registry.sendToConn(ws._connId, {
    type: "room.join.ok",
    roomId: room.roomId,
    roomCode: room.roomCode,
    ownerId: room.ownerId,
    world: { ...room.world },
    stateVersion: room.stateVersion,
    you: conn.userId,
    player: publicView(player),
    reconnectToken: player.reconnectToken,
    players: [...room.players.values()].map(publicView),
  });
  registry.broadcastToRoom(room, roomSnapshot(room), conn.userId);
}

function handleRoomLeave(ws, conn, payload) {
  const room = getRoom(conn.roomId);
  if (!room) {
    registry.sendToConn(ws._connId, errorMsg("NOT_IN_ROOM"));
    return;
  }
  const res = leaveRoom(room, conn.userId);
  if (res && res.code) {
    registry.sendToConn(ws._connId, errorMsg(res.code, res.message));
    return;
  }
  registry.setRoom(ws._connId, null);
  registry.sendToConn(ws._connId, { type: "room.leave.ok", roomId: room.roomId });
  registry.broadcastToRoom(room, roomSnapshot(room));
}

function handlePlayerMove(ws, conn, payload) {
  const room = getRoom(conn.roomId);
  if (!room) {
    registry.sendToConn(ws._connId, errorMsg("NOT_IN_ROOM"));
    return;
  }
  const res = movePlayer(room, conn.userId, payload.dir);
  if (res && res.code) {
    registry.sendToConn(ws._connId, errorMsg(res.code, res.message));
    return;
  }
  // lobby-service already broadcast the snapshot via setRoomChangeListener.
}

function handleWorldResize(ws, conn, payload) {
  const room = getRoom(conn.roomId);
  if (!room) {
    registry.sendToConn(ws._connId, errorMsg("NOT_IN_ROOM"));
    return;
  }
  const res = resizeWorld(room, conn.userId, payload.w, payload.h);
  if (res && res.code) {
    registry.sendToConn(ws._connId, errorMsg(res.code, res.message));
    return;
  }
  // snapshot broadcast by listener; also confirm to the requester explicitly.
  registry.sendToConn(ws._connId, {
    type: "world.resized",
    world: { ...room.world },
    stateVersion: room.stateVersion,
  });
}

function handleSync(ws, conn, payload) {
  const room = getRoom(payload.roomId ?? conn.roomId);
  if (!room) {
    registry.sendToConn(ws._connId, errorMsg("ROOM_NOT_FOUND"));
    return;
  }
  registry.sendToConn(ws._connId, roomSnapshot(room));
}

function handleReconnect(ws, conn, payload) {
  const room = getRoom(payload.roomId ?? conn.roomId);
  if (!room) {
    registry.sendToConn(ws._connId, errorMsg("ROOM_NOT_FOUND"));
    return;
  }
  const res = validateReconnect(room, conn.userId, payload.reconnectToken);
  if (res && res.code) {
    registry.sendToConn(ws._connId, errorMsg(res.code, res.message));
    return;
  }
  registry.setRoom(ws._connId, room.roomId);
  registry.sendToConn(ws._connId, {
    type: "session.reconnect.ok",
    roomId: room.roomId,
    reconnectToken: res.reconnectToken,
    world: { ...room.world },
    stateVersion: room.stateVersion,
  });
  registry.broadcastToRoom(room, roomSnapshot(room));
}

function onClose(ws) {
  if (ws._pingTimer) clearInterval(ws._pingTimer);
  const connId = ws._connId;
  if (connId) {
    const conn = registry.getConnection(connId);
    if (conn?.roomId) {
      const room = getRoom(conn.roomId);
      if (room) markDisconnected(room, conn.userId);
    }
    registry.removeConnection(connId);
    deleteSession(connId);
  }
}

// Local import to avoid duplication; reused by handlers above.
function publicView(p) {
  return {
    userId: p.userId,
    displayName: p.displayName,
    color: p.color,
    x: p.x,
    y: p.y,
    facing: p.facing,
    status: p.status,
  };
}
