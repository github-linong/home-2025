/**
 * Connection + channel + presence registry for the chat service.
 *
 * Channel kinds:
 *  - "group:public"      : a RESERVED, openly-joinable group that every
 *                          connection is auto-joined to on connect. It behaves
 *                          exactly like a normal group (membership, presence,
 *                          history) — there is no bespoke "public" code path.
 *                          The legacy string "public" is aliased to it via
 *                          `normalizeChannel` for back-compat.
 *  - "group:<id>"        : explicit join/leave; messages to joined members only.
 *  - "dm:<a>:<b>"        : canonical 1:1 channel; delivered to BOTH participants'
 *                          connections (resolved via userConns), regardless of
 *                          whether the recipient has "opened" the channel.
 */
import { config } from "../config.js";

/**
 * @type {Map<string, { ws: any, identity: object, ip: string, groupChannels: Set<string> }>}
 */
const conns = new Map();
const userConns = new Map(); // userId -> Set<connId>
const userIdentities = new Map(); // userId -> identity (latest wins)
const groupMembers = new Map(); // groupChannel -> Set<connId>
const userDms = new Map(); // userId -> Set<dmChannel> (remembered for welcome/history)

const presenceTimers = new Map(); // channel -> timeout

/**
 * Public chat is modeled as an openly-joinable group rather than a separate
 * channel kind. Every connection is auto-joined to it on connect, so it behaves
 * like a normal group (membership, presence, history) — no bespoke "public"
 * code path. The legacy channel id "public" is aliased to this for back-compat.
 */
export const PUBLIC_GROUP = "group:public";
export function normalizeChannel(channel) {
  return channel === "public" ? PUBLIC_GROUP : channel;
}

function send(ws, obj) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

export function registerConn(connId, ws, identity, ip) {
  conns.set(connId, { ws, identity, ip, groupChannels: new Set() });
  let set = userConns.get(identity.userId);
  if (!set) {
    set = new Set();
    userConns.set(identity.userId, set);
  }
  set.add(connId);
  userIdentities.set(identity.userId, identity);
  // Everyone is implicitly a member of the public group on connect — it lives
  // in the 群组 list like any other group, no special-casing elsewhere.
  joinGroup(connId, PUBLIC_GROUP);
}

export function removeConn(connId) {
  const c = conns.get(connId);
  if (!c) return;
  conns.delete(connId);
  const uc = userConns.get(c.identity.userId);
  if (uc) {
    uc.delete(connId);
    if (uc.size === 0) {
      userConns.delete(c.identity.userId);
      userIdentities.delete(c.identity.userId);
    }
  }
  for (const ch of c.groupChannels) {
    const g = groupMembers.get(ch);
    if (g) {
      g.delete(connId);
      if (g.size === 0) groupMembers.delete(ch);
    }
  }
  schedulePresence(PUBLIC_GROUP);
}

export function updateIdentity(connId, identity) {
  const c = conns.get(connId);
  if (!c) return;
  c.identity = identity;
  userIdentities.set(identity.userId, identity);
}

export function joinGroup(connId, channel) {
  const c = conns.get(connId);
  if (!c) return;
  c.groupChannels.add(channel);
  let g = groupMembers.get(channel);
  if (!g) {
    g = new Set();
    groupMembers.set(channel, g);
  }
  g.add(connId);
  schedulePresence(channel);
}

export function leaveGroup(connId, channel) {
  const c = conns.get(connId);
  if (!c) return;
  c.groupChannels.delete(channel);
  const g = groupMembers.get(channel);
  if (g) {
    g.delete(connId);
    if (g.size === 0) groupMembers.delete(channel);
  }
  schedulePresence(channel);
}

export function rememberDm(userId, channel) {
  let set = userDms.get(userId);
  if (!set) {
    set = new Set();
    userDms.set(userId, set);
  }
  set.add(channel);
}

/**
 * Record a DM channel for a user AND notify that user's live connections so the
 * client UI adds the channel to its list (otherwise the recipient receives the
 * message in memory but has no entry to click into). Sends a `chat.joined`
 * carrying the user's up-to-date channel membership.
 */
export function touchDmForUser(userId, channel) {
  rememberDm(userId, channel);
  const set = userConns.get(userId);
  if (!set) return;
  for (const id of set) {
    const c = conns.get(id);
    if (!c) continue;
    const ch = connChannels(id);
    send(c.ws, {
      type: "chat.joined",
      channel,
      channels: { groups: ch.groups, dms: ch.dms },
      history: [],
    });
  }
}

export function sendToChannel(channel, payload, excludeConnId = null) {
  channel = normalizeChannel(channel);
  if (channel.startsWith("group:")) {
    const g = groupMembers.get(channel);
    if (!g) return;
    for (const id of g) if (id !== excludeConnId) send(conns.get(id)?.ws, payload);
    return;
  }
  if (channel.startsWith("dm:")) {
    const ids = channel.slice(3).split(":");
    for (const uid of ids) {
      const set = userConns.get(uid);
      if (!set) continue;
      for (const id of set) if (id !== excludeConnId) send(conns.get(id)?.ws, payload);
    }
    return;
  }
}

export function sendToUser(userId, payload) {
  const set = userConns.get(userId);
  if (!set) return;
  for (const id of set) send(conns.get(id)?.ws, payload);
}

function distinctIdentities(connIdSet) {
  const seen = new Set();
  const users = [];
  for (const id of connIdSet) {
    const c = conns.get(id);
    if (c && !seen.has(c.identity.userId)) {
      seen.add(c.identity.userId);
      users.push(c.identity);
    }
  }
  return users;
}

export function presenceFor(channel) {
  channel = normalizeChannel(channel);
  if (channel.startsWith("group:")) {
    return distinctIdentities(groupMembers.get(channel) ?? new Set());
  }
  if (channel.startsWith("dm:")) {
    const ids = channel.slice(3).split(":");
    return ids.map((u) => userIdentities.get(u)).filter(Boolean);
  }
  return [];
}

export function channelMemberCount(channel) {
  channel = normalizeChannel(channel);
  if (channel.startsWith("group:")) return groupMembers.get(channel)?.size ?? 0;
  if (channel.startsWith("dm:")) {
    const ids = channel.slice(3).split(":");
    let n = 0;
    for (const uid of ids) n += userConns.get(uid)?.size ?? 0;
    return n;
  }
  return 0;
}

function schedulePresence(channel) {
  if (presenceTimers.has(channel)) return;
  const t = setTimeout(() => {
    presenceTimers.delete(channel);
    sendToChannel(channel, {
      type: "chat.presence",
      channel,
      users: presenceFor(channel),
      count: channelMemberCount(channel),
    });
  }, config.presenceDebounceMs);
  t.unref?.();
  presenceTimers.set(channel, t);
}

export function getConn(connId) {
  return conns.get(connId);
}

export function connChannels(connId) {
  const c = conns.get(connId);
  if (!c) return { groups: [], dms: [] };
  const groups = [...c.groupChannels];
  // Pin the public group to the top of the list so it always reads first.
  const pi = groups.indexOf(PUBLIC_GROUP);
  if (pi > 0) {
    groups.splice(pi, 1);
    groups.unshift(PUBLIC_GROUP);
  }
  return { groups, dms: [...(userDms.get(c.identity.userId) ?? [])] };
}

export function connIdentity(connId) {
  return conns.get(connId)?.identity ?? null;
}

export function isMember(connId, channel) {
  const c = conns.get(connId);
  if (!c) return false;
  channel = normalizeChannel(channel);
  if (channel.startsWith("group:")) return c.groupChannels.has(channel);
  if (channel.startsWith("dm:")) {
    const ids = channel.slice(3).split(":");
    return ids.includes(c.identity.userId) || (userDms.get(c.identity.userId)?.has(channel) ?? false);
  }
  return false;
}
