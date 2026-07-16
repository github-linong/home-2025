import { createHash } from "node:crypto";

/** @type {Map<string, { result: object, appliedAt: number, matchVersion: number }>} */
const store = new Map();

export function idempotencyKey(roomId, userId, handId, turnId, clientActionId) {
  return `${roomId}:${userId}:${handId}:${turnId}:${clientActionId}`;
}

export function getIdempotent(key) {
  return store.get(key) ?? null;
}

export function setIdempotent(key, result, matchVersion) {
  store.set(key, { result, appliedAt: Date.now(), matchVersion });
}

export function clearHand(handId) {
  for (const key of store.keys()) {
    if (key.includes(`:${handId}:`)) store.delete(key);
  }
}

export function clearAll() {
  store.clear();
}
