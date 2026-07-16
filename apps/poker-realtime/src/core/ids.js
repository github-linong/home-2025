import { createHash, randomBytes } from "node:crypto";
import { createDeck } from "../core/pokerEngine.mjs";

export function generateDeckSeed() {
  return randomBytes(32).toString("hex");
}

export function hashDeckSeed(seed) {
  return createHash("sha256").update(seed).digest("hex");
}

/** Deterministic PRNG from seed for Fisher-Yates shuffle */
function seededRandom(seed) {
  let h = createHash("sha256").update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) {
      h = createHash("sha256").update(h).digest();
      i = 0;
    }
    const n = h.readUInt32BE(i);
    i += 4;
    return n / 0x1_0000_0000;
  };
}

export function createSeededDeck(seed) {
  return createDeck(seededRandom(seed));
}

export function generateRoomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export function generateId(prefix) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function generateReconnectToken() {
  return randomBytes(32).toString("hex");
}
