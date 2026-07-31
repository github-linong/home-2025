import { randomBytes } from "node:crypto";

/** Deterministic, ambiguous-character-free room code (no 0/O/1/I). */
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
