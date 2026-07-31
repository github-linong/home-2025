/**
 * Fixed-window rate limiter. Keyed by user id (or IP) — cheap and good enough
 * for chat spam protection. Returns true if the action is allowed.
 */
const buckets = new Map();

export function checkRateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count <= max;
}

export function resetRateLimit(key) {
  buckets.delete(key);
}
