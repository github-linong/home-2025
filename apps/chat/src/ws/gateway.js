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
import { PUBLIC_GROUP, normalizeChannel } from "../chat/registry.js";
import { isValidInviteCode } from "../chat/invite.js";
import * as store from "../store.js";
import { log } from "../logging/logger.js";
import * as contacts from "../chat/contacts.js";

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
    let providedGuest = false;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      devUserId = url.searchParams.get("devUserId");
      const qGuest = url.searchParams.get("guestId");
      if (qGuest && PEER_RE.test(qGuest)) {
        guestId = qGuest;
        providedGuest = true;
      }
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
      // Client-supplied ids are used verbatim so chat shares one stable
      // identity with wander/poker (e.g. "u_abc1234"); only server-generated
      // ids keep the legacy "guest_" namespace for pre-unification clients.
      identity = {
        userId: providedGuest ? guestId : `guest_${guestId}`,
        name: guestName ?? "游客",
        image: null,
        isGuest: true,
      };
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
      channels: { groups: channels.groups, dms: channels.dms },
      publicHistory: store.getHistory(PUBLIC_GROUP, 50),
      serverTime: Date.now(),
    });

    // Push initial contacts list (empty for brand-new users)
    safeSend(ws, { type: "chat.contacts", contacts: contacts.getContacts(identity.userId) });

    ws.on("message", (raw) => {
      lastPing = Date.now(); // any inbound traffic (incl. client ping/pong) keeps the socket alive
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
      // When the user's last connection closes, auto-prune stale contacts.
      if (!registry.isUserOnline(identity.userId)) {
        contacts.onDisconnect(identity.userId);
      }
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
      // Enforce groupMaxMembers for non-public groups
      if (ch !== PUBLIC_GROUP && ch !== "group:public") {
        const count = registry.channelMemberCount(registry.normalizeChannel(ch));
        if (count >= config.groupMaxMembers) {
          safeSend(ws, { type: "chat.error", code: "GROUP_FULL", message: "群组已满" });
          return;
        }
      }
      registry.joinGroup(connId, ch);
      const after = registry.connChannels(connId);
      safeSend(ws, {
        type: "chat.joined",
        channel: ch,
        channels: { groups: after.groups, dms: after.dms },
        history: store.getHistory(ch, 50),
      });
    } else if (typeof ch === "string" && DM_CHANNEL_RE.test(ch)) {
      // Opening a DM notifies the peer immediately (so their UI shows the
      // thread even before any message is sent), and confirms membership to self.
      const parts = ch.slice(3).split(":");
      let peerId;
      if (parts[0] === identity.userId) peerId = parts[1];
      else if (parts[1] === identity.userId) peerId = parts[0];
      else {
        safeSend(ws, { type: "chat.error", code: "INVALID_PEER", message: "私聊对象无效" });
        return;
      }
      const resolved = `dm:${[parts[0], parts[1]].sort().join(":")}`;
      registry.rememberDm(identity.userId, resolved);
      registry.touchDmForUser(peerId, resolved); // tell the recipient's live clients
      const after = registry.connChannels(connId);
      safeSend(ws, {
        type: "chat.joined",
        channel: resolved,
        channels: { groups: after.groups, dms: after.dms },
        history: store.getHistory(resolved, 50),
      });
    } else {
      safeSend(ws, { type: "chat.error", code: "INVALID_CHANNEL", message: "仅支持 group:<id> 或 dm:<a>:<b> 形式" });
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
        channels: { groups: after.groups, dms: after.dms },
      });
    }
    return;
  }

  if (type === "chat.history") {
    const ch = msg.channel;
    if (typeof ch !== "string") return;
    const norm = normalizeChannel(ch);
    if (norm !== PUBLIC_GROUP && !registry.isMember(connId, norm)) {
      safeSend(ws, { type: "chat.error", code: "FORBIDDEN", message: "无权查看该频道历史" });
      return;
    }
    const limit = Number(msg.limit) || 50;
    safeSend(ws, { type: "chat.history", channel: norm, messages: store.getHistory(norm, Math.min(limit, 200)) });
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

    let resolved = PUBLIC_GROUP;
    if (channel === "public" || channel === PUBLIC_GROUP) {
      resolved = PUBLIC_GROUP;
    } else if (channel.startsWith("group:")) {
      if (!GROUP_RE.test(channel)) {
        safeSend(ws, { type: "chat.error", code: "INVALID_CHANNEL", message: "群组频道格式错误" });
        return;
      }
      registry.joinGroup(connId, channel); // auto-join on first post
      resolved = channel;
    } else if (channel.startsWith("dm:")) {
      // The frontend sends the canonical 2-id form `dm:<a>:<b>` (sorted). Accept
      // both that and the bare `dm:<peer>` form for robustness.
      const parts = channel.slice(3).split(":");
      let peerId;
      if (parts.length === 2 && PEER_RE.test(parts[0]) && PEER_RE.test(parts[1])) {
        if (parts[0] === identity.userId) peerId = parts[1];
        else if (parts[1] === identity.userId) peerId = parts[0];
        else {
          safeSend(ws, { type: "chat.error", code: "INVALID_PEER", message: "私聊对象无效" });
          return;
        }
        resolved = `dm:${[parts[0], parts[1]].sort().join(":")}`;
      } else if (parts.length === 1 && PEER_RE.test(parts[0])) {
        peerId = parts[0];
        resolved = canonicalDm(identity.userId, peerId);
      } else {
        safeSend(ws, { type: "chat.error", code: "INVALID_PEER", message: "私聊对象无效" });
        return;
      }
      if (peerId === identity.userId) {
        safeSend(ws, { type: "chat.error", code: "SELF_DM", message: "不能和自己私聊" });
        return;
      }
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

    // --- Contact system: record interactions on message send ---
    if (resolved.startsWith("dm:")) {
      // DM: both participants become contacts.
      const dmIds = resolved.slice(3).split(":");
      const peerId = dmIds[0] === identity.userId ? dmIds[1] : dmIds[0];
      const newForSelf = contacts.recordInteraction(identity.userId, peerId);
      const newForPeer = contacts.recordInteraction(peerId, identity.userId);
      if (newForSelf) {
        const entry = contacts.getContactEntry(identity.userId, peerId);
        if (entry) registry.sendToUser(identity.userId, { type: "chat.contactAdded", contact: entry });
      }
      if (newForPeer) {
        const entry = contacts.getContactEntry(peerId, identity.userId);
        if (entry) registry.sendToUser(peerId, { type: "chat.contactAdded", contact: entry });
      }
    } else if (resolved.startsWith("group:") && resolved !== PUBLIC_GROUP) {
      // Named group: record interaction between sender and each other member.
      const memberIds = registry
        .presenceFor(resolved)
        .map((i) => i.userId)
        .filter((uid) => uid !== identity.userId);
      for (const memberId of memberIds) {
        const newForSelf = contacts.recordInteraction(identity.userId, memberId);
        const newForMember = contacts.recordInteraction(memberId, identity.userId);
        if (newForSelf) {
          const entry = contacts.getContactEntry(identity.userId, memberId);
          if (entry) registry.sendToUser(identity.userId, { type: "chat.contactAdded", contact: entry });
        }
        if (newForMember) {
          const entry = contacts.getContactEntry(memberId, identity.userId);
          if (entry) registry.sendToUser(memberId, { type: "chat.contactAdded", contact: entry });
        }
      }
    }
    return;
  }

  if (type === "chat.createGroup") {
    if (identity.isGuest) {
      safeSend(ws, { type: "chat.error", code: "AUTH_REQUIRED", message: "仅登录用户可创建群组" });
      return;
    }
    const name = typeof msg.name === "string" ? sanitizeName(msg.name) : null;
    try {
      const { groupId, inviteCode } = registry.createGroup(null, identity.userId, { name: name ?? undefined });
      // Auto-join the creator to the new group
      registry.joinGroup(connId, groupId);
      const after = registry.connChannels(connId);
      safeSend(ws, {
        type: "chat.groupCreated",
        groupId,
        inviteCode,
        channels: { groups: after.groups, dms: after.dms },
      });
      log("info", "group_created", { groupId, inviteCode, ownerId: identity.userId });
    } catch (err) {
      safeSend(ws, { type: "chat.error", code: err.message ?? "CREATE_FAILED", message: "创建群组失败" });
    }
    return;
  }

  if (type === "chat.joinByInvite") {
    const code = typeof msg.inviteCode === "string" ? msg.inviteCode.trim().toUpperCase() : "";
    if (!isValidInviteCode(code)) {
      safeSend(ws, { type: "chat.error", code: "INVALID_INVITE", message: "邀请码格式无效" });
      return;
    }
    try {
      const channel = registry.joinGroupByInvite(connId, code);
      const after = registry.connChannels(connId);
      safeSend(ws, {
        type: "chat.joined",
        channel,
        channels: { groups: after.groups, dms: after.dms },
        history: store.getHistory(channel, 50),
        inviteCode: code,
      });
      log("info", "group_join_by_invite", { channel, userId: identity.userId, inviteCode: code });
    } catch (err) {
      const code_ = err.message ?? "INVALID_INVITE";
      const messages = {
        INVALID_INVITE: "邀请码无效或已过期",
        GROUP_FULL: "群组已满",
      };
      safeSend(ws, { type: "chat.error", code: code_, message: messages[code_] ?? "加入失败" });
    }
    return;
  }

  if (type === "chat.pinContact") {
    const targetUserId = typeof msg.userId === "string" ? msg.userId.trim() : "";
    if (!PEER_RE.test(targetUserId)) {
      safeSend(ws, { type: "chat.error", code: "INVALID_PEER", message: "联系人用户ID无效" });
      return;
    }
    if (msg.pin === true) {
      contacts.pinContact(identity.userId, targetUserId);
    } else {
      contacts.unpinContact(identity.userId, targetUserId);
    }
    safeSend(ws, { type: "chat.contacts", contacts: contacts.getContacts(identity.userId) });
    return;
  }

  if (type === "chat.hideContact") {
    const targetUserId = typeof msg.userId === "string" ? msg.userId.trim() : "";
    if (!PEER_RE.test(targetUserId)) {
      safeSend(ws, { type: "chat.error", code: "INVALID_PEER", message: "联系人用户ID无效" });
      return;
    }
    if (msg.hide === true) {
      contacts.hideContact(identity.userId, targetUserId);
    } else {
      contacts.unhideContact(identity.userId, targetUserId);
    }
    safeSend(ws, { type: "chat.contacts", contacts: contacts.getContacts(identity.userId) });
    return;
  }

  // Typing indicator: relay to other members of the channel (never echo to
  // sender). The client throttles sends to ~2s; we add no extra persistence.
  if (type === "chat.typing") {
    const ch = typeof msg.channel === "string" ? normalizeChannel(msg.channel) : "";
    if ((!ch.startsWith("group:") && !ch.startsWith("dm:")) || !registry.isMember(connId, ch)) {
      return; // ignore invalid channel or non-members
    }
    registry.sendToChannel(ch, {
      type: "chat.typing",
      channel: ch,
      user: { userId: identity.userId, name: identity.name },
    }, connId);
    return;
  }

  safeSend(ws, { type: "chat.error", code: "UNKNOWN_TYPE", message: `未知消息类型: ${type}` });
}
