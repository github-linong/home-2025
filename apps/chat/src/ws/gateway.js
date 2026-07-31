import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import {
  verifyWithApi2,
  getSession,
  setSession,
  deleteSession,
  shouldRevalidate,
  revalidateSession,
  incrementActionCount,
} from "../auth/session.js";
import { checkRateLimit } from "../rate-limit/limiter.js";
import * as registry from "../chat/registry.js";
import * as store from "../store.js";
import { log } from "../logging/logger.js";

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "";
}

function safeSend(ws, obj) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

/** Strip control chars, trim, cap length. Returns null for empty. */
function sanitizeText(text) {
  if (typeof text !== "string") return null;
  const t = text.replace(/[\u0000-\u001f]/g, "").replace(/\r/g, "").trim();
  if (!t) return null;
  return t.slice(0, config.maxTextLength);
}

function sanitizeName(name) {
  if (typeof name !== "string") return null;
  const n = name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24);
  return n.length ? n : null;
}

function canonicalDm(selfId, peerId) {
  return "dm:" + [selfId, peerId].sort().join(":");
}

const GROUP_RE = /^group:[\w-]{1,64}$/;
const PEER_RE = /^[\w-]{2,64}$/;
const DM_CHANNEL_RE = /^dm:[\w-]{2,64}:[\w-]{2,64}$/;

export function createGateway(server) {
  const wss = new WebSocketServer({ server, path: "/ws/chat", maxPayload: config.maxMessageBytes });

  wss.on("error", (err) => log("error", "wss_error", { error: err.message }));

  wss.on("connection", async (ws, req) => {
    ws.on("error", (err) => log("error", "ws_socket_error", { error: err.message }));

    const cookie = req.headers.cookie ?? "";
    const ip = clientIp(req);
    let devUserId = null;
    let guestId = randomUUID().slice(0, 8);
    let guestName = null;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      devUserId = url.searchParams.get("devUserId");
      const qGuest = url.searchParams.get("guestId");
      if (qGuest && PEER_RE.test(qGuest)) guestId = qGuest;
      guestName = sanitizeName(url.searchParams.get("guestName"));
    } catch {
      /* ignore */
    }

    // Resolve identity: logged-in (api2) or anonymous guest.
    let identity;
    const verified = await verifyWithApi2(cookie, { devUserId });
    if (verified) {
      identity = {
        userId: verified.userId,
        name: verified.user?.name ?? verified.userId,
        image: verified.user?.image ?? null,
        isGuest: false,
      };
    } else {
      identity = { userId: `guest_${guestId}`, name: guestName ?? "游客", image: null, isGuest: true };
    }

    const connId = randomUUID();
    registry.registerConn(connId, ws, identity, ip);
    setSession(connId, { ...identity, cookie });
    log("info", "ws_connected", { userId: identity.userId, isGuest: identity.isGuest, connId, ip });

    let lastPing = Date.now();
    const pingChecker = setInterval(() => {
      if (Date.now() - lastPing > config.pongTimeoutMs) {
        ws.close(4000, "ping_timeout");
        clearInterval(pingChecker);
        return;
      }
      safeSend(ws, { type: "chat.ping" });
    }, config.pingIntervalMs);
    pingChecker.unref?.();

    // Periodic re-validation of logged-in sessions (cheap; keeps identity fresh).
    const revalChecker = setInterval(() => {
      if (identity.isGuest) return;
      if (shouldRevalidate(connId)) {
        revalidateSession(connId, cookie).then((v) => {
          if (v) {
            identity = { userId: v.userId, name: v.user?.name ?? v.userId, image: v.user?.image ?? null, isGuest: false };
            registry.updateIdentity(connId, identity);
          }
        }).catch(() => {});
      }
    }, config.sessionCacheTtlMs);
    revalChecker.unref?.();

    const channels = registry.connChannels(connId);
    safeSend(ws, {
      type: "chat.welcome",
      you: identity,
      channels: { public: true, groups: channels.groups, dms: channels.dms },
      publicHistory: store.getHistory("public", 50),
      serverTime: Date.now(),
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      handle(connId, ws, msg, ip, () => identity).catch((e) =>
        log("error", "handle_error", { error: e?.message ?? String(e) }),
      );
    });

    ws.on("close", () => {
      clearInterval(pingChecker);
      clearInterval(revalChecker);
      registry.removeConn(connId);
      deleteSession(connId);
      log("info", "ws_closed", { userId: identity.userId, connId });
    });
  });
}

async function handle(connId, ws, msg, ip, getIdentity) {
  const type = msg?.type;
  const identity = getIdentity();

  if (type === "chat.ping") {
    safeSend(ws, { type: "chat.pong" });
    return;
  }
  if (type === "chat.pong") {
    return;
  }

  if (type === "chat.setGuestName") {
    if (!identity.isGuest) return;
    const name = sanitizeName(msg.name);
    if (name) {
      const next = { ...identity, name };
      registry.updateIdentity(connId, next);
      // mutate the closure identity so later messages use the new name
      Object.assign(identity, next);
      safeSend(ws, { type: "chat.identity", you: next });
    }
    return;
  }

  if (type === "chat.join") {
    const ch = msg.channel;
    if (typeof ch === "string" && GROUP_RE.test(ch)) {
      registry.joinGroup(connId, ch);
      const after = registry.connChannels(connId);
      safeSend(ws, {
        type: "chat.joined",
        channel: ch,
        channels: { public: true, groups: after.groups, dms: after.dms },
        history: store.getHistory(ch, 50),
      });
    } else {
      safeSend(ws, { type: "chat.error", code: "INVALID_CHANNEL", message: "仅支持 group:<id> 形式的群组" });
    }
    return;
  }

  if (type === "chat.leave") {
    const ch = msg.channel;
    if (typeof ch === "string" && GROUP_RE.test(ch)) {
      registry.leaveGroup(connId, ch);
      const after = registry.connChannels(connId);
      safeSend(ws, {
        type: "chat.left",
        channel: ch,
        channels: { public: true, groups: after.groups, dms: after.dms },
      });
    }
    return;
  }

  if (type === "chat.history") {
    const ch = msg.channel;
    if (typeof ch !== "string") return;
    if (ch !== "public" && !registry.isMember(connId, ch)) {
      safeSend(ws, { type: "chat.error", code: "FORBIDDEN", message: "无权查看该频道历史" });
      return;
    }
    const limit = Number(msg.limit) || 50;
    safeSend(ws, { type: "chat.history", channel: ch, messages: store.getHistory(ch, Math.min(limit, 200)) });
    return;
  }

  if (type === "chat.message") {
    const text = sanitizeText(msg.text);
    if (!text) {
      safeSend(ws, { type: "chat.error", code: "EMPTY_MESSAGE", message: "消息内容为空" });
      return;
    }
    const channel = msg.channel;
    if (typeof channel !== "string") {
      safeSend(ws, { type: "chat.error", code: "INVALID_CHANNEL", message: "缺少频道" });
      return;
    }

    let resolved = "public";
    if (channel === "public") {
      resolved = "public";
    } else if (channel.startsWith("group:")) {
      if (!GROUP_RE.test(channel)) {
        safeSend(ws, { type: "chat.error", code: "INVALID_CHANNEL", message: "群组频道格式错误" });
        return;
      }
      registry.joinGroup(connId, channel); // auto-join on first post
      resolved = channel;
    } else if (channel.startsWith("dm:")) {
      const peerId = channel.slice(3);
      if (!PEER_RE.test(peerId)) {
        safeSend(ws, { type: "chat.error", code: "INVALID_PEER", message: "私聊对象无效" });
        return;
      }
      if (peerId === identity.userId) {
        safeSend(ws, { type: "chat.error", code: "SELF_DM", message: "不能和自己私聊" });
        return;
      }
      resolved = canonicalDm(identity.userId, peerId);
      registry.rememberDm(identity.userId, resolved);
      // Notify the recipient so their UI surfaces the DM thread (not just the
      // sender's). Without this the peer gets the message in memory but has no
      // channel entry to open it from.
      registry.touchDmForUser(peerId, resolved);
    } else {
      safeSend(ws, { type: "chat.error", code: "INVALID_CHANNEL", message: "不支持的频道类型" });
      return;
    }

    // Rate limit (per user + per IP).
    if (!checkRateLimit(`u:${identity.userId}`, config.rateLimit.maxMessages, config.rateLimit.windowMs)) {
      safeSend(ws, { type: "chat.error", code: "RATE_LIMITED", message: "发送过于频繁，请稍后再试" });
      return;
    }
    if (!checkRateLimit(`ip:${ip}`, config.rateLimit.ipMaxMessages, config.rateLimit.windowMs)) {
      safeSend(ws, { type: "chat.error", code: "RATE_LIMITED", message: "发送过于频繁" });
      return;
    }

    const out = {
      id: randomUUID(),
      channel: resolved,
      author: identity,
      text,
      ts: Date.now(),
      clientMsgId: typeof msg.clientMsgId === "string" ? msg.clientMsgId.slice(0, 64) : undefined,
    };
    store.append(resolved, out, config.historyPerChannel);
    registry.sendToChannel(resolved, { type: "chat.message", ...out });
    safeSend(ws, {
      type: "chat.ack",
      clientMsgId: out.clientMsgId,
      id: out.id,
      ts: out.ts,
      channel: resolved,
    });
    incrementActionCount(connId);
    return;
  }

  safeSend(ws, { type: "chat.error", code: "UNKNOWN_TYPE", message: `未知消息类型: ${type}` });
}
