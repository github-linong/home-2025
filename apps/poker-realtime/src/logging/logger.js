import { sanitizeForLog } from "./sanitize.js";

const redactOff = process.env.LOG_REDACT_OFF === "true";

export function log(level, event, fields = {}) {
  const payload = redactOff ? fields : sanitizeForLog(fields);
  const line = JSON.stringify({
    level,
    event,
    time: Date.now(),
    ...payload,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}
