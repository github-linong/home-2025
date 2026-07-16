import { ErrorCodes } from "../protocol/errors.js";

/** @type {Map<string, { count: number, windowStart: number, strikes: number, bannedUntil: number }>} */
const buckets = new Map();

const LIMITS = {
  "room.create": { max: 5, windowMs: 60 * 60 * 1000 },
  "room.join": { max: 10, windowMs: 60 * 1000 },
  "room.addBot": { max: 30, windowMs: 60 * 1000 },
  "room.removeBot": { max: 30, windowMs: 60 * 1000 },
  "room.transferOwner": { max: 10, windowMs: 60 * 1000 },
  "game.action": { max: 30, windowMs: 60 * 1000 },
  "session.reconnect": { max: 20, windowMs: 10 * 60 * 1000 },
  "ip.room.join": { max: 30, windowMs: 60 * 1000 },
};

function bucketKey(id, event) {
  return `${id}:${event}`;
}

function hitBucket(key, limit) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { count: 0, windowStart: now, strikes: 0, bannedUntil: 0 };
    buckets.set(key, b);
  }

  if (b.bannedUntil > now) {
    return {
      ok: false,
      retryAfter: Math.ceil((b.bannedUntil - now) / 1000),
    };
  }

  if (now - b.windowStart > limit.windowMs) {
    b.count = 0;
    b.windowStart = now;
  }

  b.count += 1;
  if (b.count > limit.max) {
    b.strikes += 1;
    if (b.strikes >= 3) {
      b.bannedUntil = now + 15 * 60 * 1000;
    }
    return {
      ok: false,
      retryAfter: Math.ceil(limit.windowMs / 1000),
    };
  }

  return { ok: true };
}

export function checkRateLimit(userId, event) {
  const limit = LIMITS[event];
  if (!limit) return { ok: true };
  return hitBucket(bucketKey(userId, event), limit);
}

/** IP-scoped limit for room-code guessing (join). */
export function checkIpRateLimit(ip, event = "ip.room.join") {
  if (!ip) return { ok: true };
  const limit = LIMITS[event];
  if (!limit) return { ok: true };
  return hitBucket(bucketKey(`ip:${ip}`, event), limit);
}

export function isAbuseBanned(userId) {
  for (const [key, b] of buckets) {
    if (key.startsWith(`${userId}:`) && b.bannedUntil > Date.now()) {
      return true;
    }
  }
  return false;
}

/** Test helper: force ban state for a user. */
export function forceAbuseBan(userId, ms = 15 * 60 * 1000) {
  const key = bucketKey(userId, "game.action");
  buckets.set(key, {
    count: 999,
    windowStart: Date.now(),
    strikes: 3,
    bannedUntil: Date.now() + ms,
  });
}

/** Test helper: clear all buckets. */
export function resetRateLimits() {
  buckets.clear();
}

export function rateLimitError(retryAfter) {
  return {
    code: ErrorCodes.RATE_LIMITED,
    message: ErrorCodes.RATE_LIMITED,
    retryable: true,
    retryAfter,
  };
}
