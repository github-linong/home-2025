import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { ErrorCodes, makeError } from "../protocol/errors.js";
import {
  verifyWithApi2,
  getSession,
  setSession,
  deleteSession,
  shouldRevalidate,
  revalidateSession,
  incrementActionCount,
} from "../auth/session.js";
import { checkRateLimit, checkIpRateLimit, isAbuseBanned, rateLimitError } from "../rate-limit/limiter.js";
import {
  createRoom,
  getRoom,
  getRoomByCode,
  lockSeat,
  confirmSeat,
  setReady,
  leaveRoom,
  allReady,
  roomSnapshot,
  validateReconnect,
  markDisconnected,
  clearDisconnectTimer,
  releaseExpiredLocks,
  bumpRoomVersion,
  rooms,
  setRoomChangeListener,
  sweepIdleEmptyRooms,
  addBotSeat,
  removeOneBotSeat,
  finalizeRemoveBot,
  markLeaveAfterHand,
  transferOwner,
  effectiveOwnerId,
  clearActingOwnerIfOwnerReturned,
} from "../lobby/lobby-service.js";
import { createMatch, getMatch, destroyMatch } from "../match/runtime.js";
import {
  registerConnection,
  removeConnection,
  setRoom,
  broadcastToRoom,
  sendToConn,
  sendToUser,
  kickUser,
  kickConnection,
  getConnection,
} from "./connection-registry.js";
import { log } from "../logging/logger.js";

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "";
}

/** @type {Map<string, import('../match/runtime.js').MatchRuntime>} */
const roomMatches = new Map();

export function createGateway(server) {
  const wss = new WebSocketServer({ server, path: "/ws/poker", maxPayload: config.maxMessageBytes });

  // Presence changes (ping timeout / WS close / reconnect grace) → room.snapshot.
  setRoomChangeListener((room) => {
    broadcastToRoom(room, roomSnapshot(room));
  });

  // Empty lobby rooms: GC after ROOM_IDLE_TTL_MS (default 30m).
  const idleSweeper = setInterval(() => {
    const swept = sweepIdleEmptyRooms();
    for (const roomId of swept) {
      const match = roomMatches.get(roomId);
      if (match) {
        destroyMatch(match.matchId);
        roomMatches.delete(roomId);
      }
      log("info", "room_idle_gc", { roomId });
    }
  }, Math.min(60_000, Math.max(5_000, Math.floor(config.roomIdleTtlMs / 6))));
  idleSweeper.unref?.();

  wss.on("error", (err) => {
    log("error", "wss_error", { error: err.message });
  });

  wss.on("connection", async (ws, req) => {
    // Prevent protocol errors from crashing the whole process.
    ws.on("error", (err) => {
      log("error", "ws_socket_error", { error: err.message });
    });

    const cookie = req.headers.cookie ?? "";
    const ip = clientIp(req);
    let devUserId = null;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      devUserId = url.searchParams.get("devUserId");
    } catch {
      /* ignore */
    }

    // Buffer early client frames while auth is in flight. Otherwise room.create
    // sent on browser `onopen` is dropped before the message listener exists.
    /** @type {import('ws').RawData[]} */
    const pendingRaw = [];
    let authed = false;
    let closedBeforeAuth = false;
    /** @type {string|null} */
    let connId = null;
    /** @type {ReturnType<typeof setInterval>|null} */
    let pingChecker = null;

    const earlyMessage = (raw) => {
      if (!authed) pendingRaw.push(raw);
    };
    ws.on("message", earlyMessage);
    ws.on("close", () => {
      closedBeforeAuth = true;
    });

    const verified = await verifyWithApi2(cookie, { devUserId });
    if (!verified) {
      try {
        ws.send(
          JSON.stringify({
            type: "game.error",
            error: {
              code: ErrorCodes.AUTH_REQUIRED,
              message: "Please log in to play",
              retryable: false,
            },
          }),
        );
      } catch {
        /* ignore */
      }
      try {
        ws.close(4401, ErrorCodes.AUTH_REQUIRED);
      } catch {
        /* ignore */
      }
      return;
    }
    if (closedBeforeAuth) return;

    connId = registerConnection(ws, verified.userId, cookie);
    setSession(connId, { ...verified, cookie });
    log("info", "ws_connected", { userId: verified.userId, connId, ip });

    let lastPing = Date.now();
    pingChecker = setInterval(() => {
      if (Date.now() - lastPing > config.pongTimeoutMs) {
        const conn = getConnection(connId);
        if (conn?.roomId) {
          const room = getRoom(conn.roomId);
          if (room) markDisconnected(room, verified.userId);
        }
        ws.close(4000, "ping_timeout");
        clearInterval(pingChecker);
      }
    }, config.pingIntervalMs);
    pingChecker.unref?.();

    async function dispatchMessage(raw) {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === "game.ping") {
          lastPing = Date.now();
          sendToConn(connId, {
            type: "game.pong",
            requestId: msg.requestId,
            serverTime: Date.now(),
          });
          return;
        }

        log("info", "ws_message", { type: msg.type, userId: verified.userId, connId });

        const session = getSession(connId);
        if (!session) {
          sendError(connId, msg.requestId, makeError(ErrorCodes.SESSION_EXPIRED));
          kickConnection(connId, verified.userId, "session_expired");
          return;
        }

        if (
          shouldRevalidate(connId) ||
          ["room.join", "game.start"].includes(msg.type)
        ) {
          const rev = await revalidateSession(connId, cookie);
          if (!rev) {
            sendError(connId, msg.requestId, makeError(ErrorCodes.SESSION_EXPIRED));
            const conn = getConnection(connId);
            if (conn?.roomId) {
              const room = getRoom(conn.roomId);
              if (room) markDisconnected(room, session.userId);
            }
            kickConnection(connId, session.userId, "session_expired");
            return;
          }
        }

        if (isAbuseBanned(session.userId) && ["game.action", "room.join"].includes(msg.type)) {
          sendError(connId, msg.requestId, makeError(ErrorCodes.FORBIDDEN));
          return;
        }

        if (msg.type === "room.join") {
          const ipRl = checkIpRateLimit(ip, "ip.room.join");
          if (!ipRl.ok) {
            sendError(connId, msg.requestId, rateLimitError(ipRl.retryAfter));
            return;
          }
        }

        const rl = checkRateLimit(session.userId, msg.type);
        if (!rl.ok) {
          sendError(connId, msg.requestId, rateLimitError(rl.retryAfter));
          return;
        }

        const result = await handleMessage(connId, session.userId, session.user, msg);
        if (result.reply) {
          if (Array.isArray(result.reply)) {
            for (const r of result.reply) sendToConn(connId, r);
          } else {
            sendToConn(connId, result.reply);
          }
        }
        if (result.broadcast) {
          for (const b of result.broadcast) {
            if (b.targetUserId) sendToUser(b.targetUserId, b);
            else if (result.room) broadcastToRoom(result.room, b);
          }
        }
      } catch (err) {
        log("error", "ws_message_error", { error: err.message });
        sendError(connId, null, makeError(ErrorCodes.INTERNAL_ERROR));
      }
    }

    ws.removeListener("message", earlyMessage);
    ws.on("message", (raw) => {
      void dispatchMessage(raw);
    });
    ws.on("close", () => {
      if (pingChecker) clearInterval(pingChecker);
      const conn = getConnection(connId);
      if (conn?.roomId) {
        const room = getRoom(conn.roomId);
        if (room) markDisconnected(room, conn.userId);
      }
      deleteSession(connId);
      removeConnection(connId);
    });

    authed = true;
    sendToConn(connId, {
      type: "session.ready",
      userId: verified.userId,
      serverTime: Date.now(),
    });

    for (const raw of pendingRaw) {
      await dispatchMessage(raw);
    }
  });

  return wss;
}

function sendError(connId, requestId, error) {
  sendToConn(connId, {
    type: "game.error",
    requestId,
    error,
  });
}

async function handleMessage(connId, userId, user, msg) {
  const { type, requestId, payload = {} } = msg;

  switch (type) {
    case "room.create":
      return handleRoomCreate(connId, userId, user, requestId);
    case "room.join":
      return handleRoomJoin(connId, userId, user, requestId, payload);
    case "room.leave":
      return handleRoomLeave(connId, userId, requestId, payload);
    case "room.addBot":
      return handleAddBot(connId, userId, requestId, payload);
    case "room.removeBot":
      return handleRemoveBot(connId, userId, requestId, payload);
    case "room.transferOwner":
      return handleTransferOwner(connId, userId, requestId, payload);
    case "game.ready":
    case "game.unready":
      return handleReady(connId, userId, requestId, payload, type === "game.ready");
    case "game.start":
      return handleGameStart(connId, userId, requestId, payload);
    case "game.action":
      return handleGameAction(connId, userId, requestId, payload);
    case "game.endMatch":
      return handleEndMatch(connId, userId, requestId, payload);
    case "session.reconnect":
      return handleReconnect(connId, userId, requestId, payload);
    case "sync.request":
      return handleSyncRequest(connId, userId, requestId, payload);
    default:
      sendError(connId, requestId, makeError(ErrorCodes.INVALID_ACTION, `Unknown type: ${type}`));
      return {};
  }
}

function handleRoomCreate(connId, userId, user, requestId) {
  const room = createRoom(userId, user.name ?? user.email ?? "Player");
  setRoom(connId, room.roomId);
  lockSeat(room, userId, 0);
  const confirmed = confirmSeat(room, userId, user.name ?? "You", 0);
  return {
    room,
    reply: {
      type: "room.create.ok",
      requestId,
      roomId: room.roomId,
      roomCode: room.roomCode,
      seatIndex: 0,
      reconnectToken: confirmed.reconnectToken,
    },
    broadcast: [roomSnapshot(room)],
  };
}

function handleRoomJoin(connId, userId, user, requestId, payload) {
  const room = getRoomByCode(payload.roomCode);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.ROOM_NOT_FOUND));
    return {};
  }
  if (room.roomState === "archived") {
    sendError(connId, requestId, makeError(ErrorCodes.ROOM_NOT_FOUND));
    return {};
  }

  releaseExpiredLocks(room);
  let seatIndex = payload.seatIndex;
  if (seatIndex == null) {
    seatIndex = room.seats.findIndex((s) => s.status === "empty");
    if (seatIndex === -1) {
      sendError(connId, requestId, makeError(ErrorCodes.ROOM_FULL));
      return {};
    }
  }

  const lockResult = lockSeat(room, userId, seatIndex);
  if (lockResult.code) {
    sendError(connId, requestId, lockResult);
    return {};
  }

  const confirmResult = confirmSeat(room, userId, user.name ?? "Player", seatIndex);
  if (confirmResult.code) {
    sendError(connId, requestId, confirmResult);
    return {};
  }

  setRoom(connId, room.roomId);
  return {
    room,
    reply: {
      type: "room.join.ok",
      requestId,
      roomId: room.roomId,
      seatIndex,
      reconnectToken: confirmResult.reconnectToken,
    },
    broadcast: [roomSnapshot(room)],
  };
}

async function handleRoomLeave(connId, userId, requestId, payload) {
  const room = getRoom(payload.roomId);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.NOT_IN_ROOM));
    return {};
  }

  const result = leaveRoom(room, userId);
  if (result.code) {
    sendError(connId, requestId, result);
    return {};
  }

  if (result.leaveAfterHand && room.matchId) {
    const runtime = getMatch(room.matchId);
    if (runtime) {
      await runtime.requestForceFold(userId);
    }
  }

  setRoom(connId, null);
  return {
    room,
    reply: { type: "room.leave.ok", requestId },
    broadcast: [roomSnapshot(room)],
  };
}

function requireEffectiveOwner(room, userId) {
  if (effectiveOwnerId(room) !== userId) {
    return makeError(ErrorCodes.NOT_OWNER);
  }
  return null;
}

function handleAddBot(connId, userId, requestId, payload) {
  const roomId = payload.roomId ?? getConnection(connId)?.roomId;
  const room = getRoom(roomId);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.NOT_IN_ROOM));
    return {};
  }
  const ownerErr = requireEffectiveOwner(room, userId);
  if (ownerErr) {
    sendError(connId, requestId, ownerErr);
    return {};
  }
  if (room.roomState === "archived") {
    sendError(connId, requestId, makeError(ErrorCodes.INVALID_ACTION));
    return {};
  }

  const result = addBotSeat(room);
  if (result.code) {
    sendError(connId, requestId, result);
    return {};
  }
  return {
    room,
    reply: {
      type: "room.addBot.ok",
      requestId,
      seatIndex: result.seatIndex,
      userId: result.userId,
    },
    broadcast: [roomSnapshot(room)],
  };
}

async function handleRemoveBot(connId, userId, requestId, payload) {
  const roomId = payload.roomId ?? getConnection(connId)?.roomId;
  const room = getRoom(roomId);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.NOT_IN_ROOM));
    return {};
  }
  const ownerErr = requireEffectiveOwner(room, userId);
  if (ownerErr) {
    sendError(connId, requestId, ownerErr);
    return {};
  }

  const target = removeOneBotSeat(room);
  if (target.code) {
    sendError(connId, requestId, target);
    return {};
  }

  const inHand =
    room.roomState === "inMatch" &&
    room.matchId &&
    getMatch(room.matchId)?.handState?.seats?.some((s) => s.userId === target.userId);

  if (inHand) {
    markLeaveAfterHand(room, target.userId);
    const runtime = getMatch(room.matchId);
    if (runtime) await runtime.requestForceFold(target.userId);
  } else {
    finalizeRemoveBot(room, target.seatIndex);
  }

  return {
    room,
    reply: {
      type: "room.removeBot.ok",
      requestId,
      seatIndex: target.seatIndex,
      userId: target.userId,
    },
    broadcast: [roomSnapshot(room)],
  };
}

function handleTransferOwner(connId, userId, requestId, payload) {
  const roomId = payload.roomId ?? getConnection(connId)?.roomId;
  const room = getRoom(roomId);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.NOT_IN_ROOM));
    return {};
  }
  const result = transferOwner(room, userId, payload.toUserId);
  if (result.code) {
    sendError(connId, requestId, result);
    return {};
  }
  return {
    room,
    reply: { type: "room.transferOwner.ok", requestId, ownerId: result.ownerId },
    broadcast: [roomSnapshot(room)],
  };
}

function handleReady(connId, userId, requestId, payload, ready) {
  const room = getRoom(payload.roomId);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.NOT_IN_ROOM));
    return {};
  }
  const result = setReady(room, userId, ready);
  if (result.code) {
    sendError(connId, requestId, result);
    return {};
  }
  return {
    room,
    reply: { type: ready ? "game.ready.ok" : "game.unready.ok", requestId, ready },
    broadcast: [roomSnapshot(room)],
  };
}

function handleGameStart(connId, userId, requestId, payload) {
  const room = getRoom(payload.roomId);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.ROOM_NOT_FOUND));
    return {};
  }
  if (effectiveOwnerId(room) !== userId) {
    sendError(connId, requestId, makeError(ErrorCodes.NOT_OWNER));
    return {};
  }
  if (!allReady(room)) {
    sendError(connId, requestId, makeError(ErrorCodes.NOT_ALL_READY));
    return {};
  }
  if (room.roomState === "inMatch" && room.matchId) {
    return {
      room,
      reply: { type: "game.start.ok", requestId, matchId: room.matchId, alreadyStarted: true },
    };
  }

  room.roomState = "inMatch";
  bumpRoomVersion(room);

  const runtime = createMatch(
    room,
    (msg) => {
      if (msg.targetUserId) sendToUser(msg.targetUserId, msg);
      else broadcastToRoom(room, msg);
    },
    (_match, _result) => {},
  );
  roomMatches.set(room.roomId, runtime);
  const { matchId, handId } = runtime.startMatch();

  return {
    room,
    reply: { type: "game.start.ok", requestId, matchId, handId },
    broadcast: [roomSnapshot(room)],
  };
}

async function handleGameAction(connId, userId, requestId, payload) {
  incrementActionCount(connId);
  const room = getRoom(payload.roomId);
  if (!room || !room.matchId) {
    sendError(connId, requestId, makeError(ErrorCodes.MATCH_NOT_FOUND));
    return {};
  }
  const runtime = getMatch(room.matchId);
  if (!runtime) {
    sendError(connId, requestId, makeError(ErrorCodes.MATCH_NOT_FOUND));
    return {};
  }

  const ack = await runtime.enqueue({
    type: "game.action",
    userId,
    payload,
  });

  if (!ack.ok) {
    sendError(connId, requestId, ack.error);
    return {};
  }

  if (ack.code === ErrorCodes.IDEMPOTENT_REPLAY_OK) {
    return {
      reply: {
        type: "game.action.ok",
        requestId,
        code: ErrorCodes.IDEMPOTENT_REPLAY_OK,
        matchVersion: ack.matchVersion,
      },
    };
  }

  return {
    reply: {
      type: "game.action.ok",
      requestId,
      matchVersion: ack.matchVersion,
      result: ack.result,
    },
  };
}

function handleEndMatch(connId, userId, requestId, payload) {
  const room = getRoom(payload.roomId);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.ROOM_NOT_FOUND));
    return {};
  }
  if (effectiveOwnerId(room) !== userId) {
    sendError(connId, requestId, makeError(ErrorCodes.NOT_OWNER));
    return {};
  }
  const runtime = roomMatches.get(room.roomId);
  if (runtime) {
    runtime.endMatch();
    room.roomState = "postMatchGrace";
    bumpRoomVersion(room);
  }
  return {
    room,
    reply: { type: "game.endMatch.ok", requestId },
    broadcast: [roomSnapshot(room)],
  };
}

function handleReconnect(connId, userId, requestId, payload) {
  const room = getRoom(payload.roomId);
  if (!room) {
    sendError(connId, requestId, makeError(ErrorCodes.MATCH_NOT_FOUND));
    return {};
  }
  const result = validateReconnect(
    room,
    userId,
    payload.seatId,
    payload.reconnectToken,
    payload.matchId,
  );
  if (result.code) {
    sendError(connId, requestId, result);
    return {};
  }
  clearDisconnectTimer(room, userId);
  setRoom(connId, room.roomId);

  const runtime = room.matchId ? getMatch(room.matchId) : null;
  if (runtime) runtime.noteReconnect(userId);

  // Fixed order: ACK → room snapshot → public → private (private via targetUserId)
  const ack = {
    type: "session.reconnect.ok",
    requestId,
    roomId: room.roomId,
    matchId: room.matchId,
    reconnectToken: result.reconnectToken,
    matchVersion: runtime?.handState?.matchVersion ?? 0,
    turnId: runtime?.handState?.turnId ?? 0,
  };

  const broadcast = [roomSnapshot(room)];
  if (runtime?.handState) {
    // Queue snapshot rebuild so it doesn't race with in-flight actions
    const publicSnap = runtime.buildPublicSnapshot();
    const privateSnap = runtime.buildPrivateSnapshot(userId);
    if (publicSnap) broadcast.push(publicSnap);
    if (privateSnap) broadcast.push(privateSnap);
  }

  return { room, reply: ack, broadcast };
}

async function handleSyncRequest(connId, userId, requestId, payload) {
  const room = getRoom(payload.roomId);
  if (!room?.matchId) {
    sendError(connId, requestId, makeError(ErrorCodes.MATCH_NOT_FOUND));
    return {};
  }
  const runtime = getMatch(room.matchId);
  if (!runtime) {
    sendError(connId, requestId, makeError(ErrorCodes.MATCH_NOT_FOUND));
    return {};
  }
  await runtime.enqueue({
    type: "sync.request",
    userId,
    payload,
  });
  return { reply: { type: "sync.request.ok", requestId } };
}

export { kickUser, rooms, roomMatches };
