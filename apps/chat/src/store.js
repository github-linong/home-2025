/**
 * In-memory per-channel message ring buffer. Keeps the most recent N messages
 * per channel so clients can load recent history on join. Swap this module for
 * a MySQL/Redis-backed store later without changing call sites.
 */
import { config } from "./config.js";

/** @type {Map<string, any[]>} */
const channels = new Map();

export function append(channel, msg, max = config.historyPerChannel) {
  let arr = channels.get(channel);
  if (!arr) {
    arr = [];
    channels.set(channel, arr);
  }
  arr.push(msg);
  if (arr.length > max) arr.splice(0, arr.length - max);
}

export function getHistory(channel, limit = 50) {
  const arr = channels.get(channel);
  if (!arr) return [];
  return arr.slice(Math.max(0, arr.length - limit));
}

export function has(channel) {
  return channels.has(channel);
}
