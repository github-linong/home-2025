import { config } from "../config.js";

/**
 * Per-connection session cache. For chat, auth is *optional*: a verified
 * better-auth session (via api2 /api/me) yields a real identity; otherwise the
 * connection is treated as an anonymous guest.
 */
const sessionsByConnId = new Map();

export function getSession(connId) {
  return sessionsByConnId.get(connId);
}

export function setSession(connId, session) {
  sessionsByConnId.set(connId, {
    ...session,
    verifiedAt: Date.now(),
    actionCountSinceVerify: 0,
  });
}

export function deleteSession(connId) {
  sessionsByConnId.delete(connId);
}

export function incrementActionCount(connId) {
  const s = sessionsByConnId.get(connId);
  if (s) s.actionCountSinceVerify += 1;
}

export function resetActionCount(connId) {
  const s = sessionsByConnId.get(connId);
  if (s) {
    s.actionCountSinceVerify = 0;
    s.verifiedAt = Date.now();
  }
}

function parseCookie(header, name) {
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/**
 * Verify a connection's identity via api2's /api/me. Returns
 * `{ userId, user }` when authenticated, or `null` for anonymous.
 * In DEV_SKIP_AUTH mode it returns a dev identity so local testing works
 * without a running api2.
 */
export async function verifyWithApi2(cookieHeader, opts = {}) {
  if (config.devSkipAuth) {
    const fromQuery = opts.devUserId?.trim();
    const fromCookie = parseCookie(cookieHeader, "chat_dev_uid");
    const devUserId =
      (fromQuery && /^[\w-]{2,64}$/.test(fromQuery) && fromQuery) ||
      (fromCookie && /^[\w-]{2,64}$/.test(fromCookie) && fromCookie);
    // Explicit dev identity (?devUserId= or chat_dev_uid cookie) => logged-in Dev
    // user, so logged-in-only features can be exercised locally. With no dev id
    // supplied, behave like a NORMAL anonymous guest — the default local dev
    // experience should match the real unauthenticated user (a temporary user),
    // not a fake "已登录".
    if (!devUserId) return null;
    return {
      userId: devUserId,
      user: {
        id: devUserId,
        name: `Dev ${devUserId.slice(-4)}`,
        image: null,
      },
    };
  }

  try {
    const res = await fetch(`${config.api2BaseUrl}/api/me`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.authenticated || !data.user?.id) return null;
    return { userId: data.user.id, user: data.user };
  } catch {
    return null;
  }
}

export function shouldRevalidate(connId) {
  const s = sessionsByConnId.get(connId);
  if (!s) return true;
  if (Date.now() - s.verifiedAt > config.sessionCacheTtlMs) return true;
  if (s.actionCountSinceVerify >= config.sessionRecheckEveryActions) return true;
  return false;
}

export async function revalidateSession(connId, cookieHeader) {
  const existing = sessionsByConnId.get(connId);
  if (config.devSkipAuth) {
    if (!existing) return null;
    existing.verifiedAt = Date.now();
    existing.actionCountSinceVerify = 0;
    return { userId: existing.userId, user: existing.user };
  }
  const verified = await verifyWithApi2(cookieHeader);
  if (!verified) {
    deleteSession(connId);
    return null;
  }
  if (existing && existing.userId !== verified.userId) {
    deleteSession(connId);
    return null;
  }
  setSession(connId, { userId: verified.userId, user: verified.user, cookie: cookieHeader });
  return verified;
}
