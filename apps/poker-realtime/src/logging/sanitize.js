import { createHash } from "node:crypto";

export function hashHoleCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const normalized = cards
    .map((c) => `${c.rank}${c.suit}`)
    .sort()
    .join(",");
  return createHash("sha256").update(normalized).digest("hex");
}

export function sanitizeForLog(payload) {
  if (payload == null) return payload;
  if (Array.isArray(payload)) return payload.map(sanitizeForLog);
  if (typeof payload !== "object") return payload;

  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "holeCards" || key === "hole") {
      out[key] = "[REDACTED]";
    } else if (key === "deckSeed") {
      out[key] = "[REDACTED]";
    } else {
      out[key] = sanitizeForLog(value);
    }
  }
  return out;
}
