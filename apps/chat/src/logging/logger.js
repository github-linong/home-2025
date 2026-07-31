/**
 * Minimal structured logger. Mirrors the shape used by poker-realtime so logs
 * stay consistent across realtime services.
 */
export function log(level, event, data = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else console.log(line);
}
