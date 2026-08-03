/**
 * Contact management — auto-contact system based on recent interactions.
 *
 * Design principle: instead of friend-requests, users who have exchanged DMs
 * or chatted in the same group automatically become contacts.  All data lives
 * in memory and is cleared on server restart (persistence is a later phase).
 *
 * Data structure:
 *   userContacts: Map<userId, {
 *     contacts: Set<contactUserId>,                     // all known contacts
 *     pinned: Set<contactUserId>,                       // pinned contacts
 *     hidden: Set<contactUserId>,                      // hidden contacts
 *     lastInteraction: Map<contactUserId, timestamp>   // last interaction time
 *   }>
 */
import { config } from "../config.js";
import { isUserOnline, getUserIdentity } from "./registry.js";
import { log } from "../logging/logger.js";

/** @type {Map<string, {contacts: Set<string>, pinned: Set<string>, hidden: Set<string>, lastInteraction: Map<string, number>}>} */
const userContacts = new Map();

/**
 * Get or create the contact entry for a user.
 * @param {string} userId
 * @returns {{contacts: Set<string>, pinned: Set<string>, hidden: Set<string>, lastInteraction: Map<string, number>}}
 */
function getOrCreate(userId) {
  let entry = userContacts.get(userId);
  if (!entry) {
    entry = {
      contacts: new Set(),
      pinned: new Set(),
      hidden: new Set(),
      lastInteraction: new Map(),
    };
    userContacts.set(userId, entry);
  }
  return entry;
}

/**
 * Prune the oldest contacts that exceed maxContacts, preserving pinned ones.
 * @param {{contacts: Set<string>, pinned: Set<string>, hidden: Set<string>, lastInteraction: Map<string, number>}} entry
 */
function pruneOldest(entry) {
  if (entry.contacts.size <= config.maxContacts) return;
  // Sort by lastInteraction ascending; remove non-pinned oldest first.
  const sorted = [...entry.contacts]
    .filter((uid) => !entry.pinned.has(uid))
    .sort((a, b) => (entry.lastInteraction.get(a) ?? 0) - (entry.lastInteraction.get(b) ?? 0));
  const toRemove = sorted.slice(0, entry.contacts.size - config.maxContacts);
  for (const uid of toRemove) {
    entry.contacts.delete(uid);
    entry.pinned.delete(uid);
    entry.hidden.delete(uid);
    entry.lastInteraction.delete(uid);
  }
}

/**
 * Record an interaction between two users (called on DM or group message).
 * Both users are added to each other's contact list.
 *
 * @param {string} userId         - The recording user
 * @param {string} contactUserId  - The user they interacted with
 * @returns {boolean} `true` if this is a NEW contact for `userId`
 */
export function recordInteraction(userId, contactUserId) {
  if (userId === contactUserId) return false;
  const entry = getOrCreate(userId);
  const wasNew = !entry.contacts.has(contactUserId);
  entry.contacts.add(contactUserId);
  entry.lastInteraction.set(contactUserId, Date.now());
  // Keep contact list within the configured maximum.
  pruneOldest(entry);
  if (wasNew) {
    log("info", "contact_added", { userId, contactUserId });
  }
  return wasNew;
}

/**
 * Build a single contact entry object for API/WebSocket responses.
 * @param {string} userId          - The owner of the contact list
 * @param {string} contactUserId   - The contact to look up
 * @returns {object|null} Contact object or null if not a contact
 */
export function getContactEntry(userId, contactUserId) {
  const entry = userContacts.get(userId);
  if (!entry || !entry.contacts.has(contactUserId)) return null;
  const identity = getUserIdentity(contactUserId);
  return {
    userId: contactUserId,
    name: identity?.name ?? contactUserId,
    image: identity?.image ?? null,
    isGuest: identity?.isGuest ?? false,
    isOnline: isUserOnline(contactUserId),
    lastInteraction: entry.lastInteraction.get(contactUserId) ?? 0,
    isPinned: entry.pinned.has(contactUserId),
    isHidden: entry.hidden.has(contactUserId),
  };
}

/**
 * Get a user's full contact list, sorted by priority:
 *   pinned > online > most recent interaction.
 * Hidden contacts are excluded.
 *
 * @param {string} userId
 * @returns {Array<object>}
 */
export function getContacts(userId) {
  const entry = userContacts.get(userId);
  if (!entry) return [];

  const result = [];
  for (const contactUserId of entry.contacts) {
    if (entry.hidden.has(contactUserId)) continue;
    const identity = getUserIdentity(contactUserId);
    result.push({
      userId: contactUserId,
      name: identity?.name ?? contactUserId,
      image: identity?.image ?? null,
      isGuest: identity?.isGuest ?? false,
      isOnline: isUserOnline(contactUserId),
      lastInteraction: entry.lastInteraction.get(contactUserId) ?? 0,
      isPinned: entry.pinned.has(contactUserId),
      isHidden: false,
    });
  }

  // Sort: pinned first, then online, then by most recent interaction.
  result.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return b.lastInteraction - a.lastInteraction;
  });

  return result;
}

/**
 * Pin a contact so they stay at the top of the list.
 * @param {string} userId
 * @param {string} contactUserId
 * @returns {boolean} `true` if the contact was found and pinned
 */
export function pinContact(userId, contactUserId) {
  const entry = getOrCreate(userId);
  if (!entry.contacts.has(contactUserId)) return false;
  entry.pinned.add(contactUserId);
  return true;
}

/**
 * Remove the pinned flag from a contact.
 * @param {string} userId
 * @param {string} contactUserId
 * @returns {boolean}
 */
export function unpinContact(userId, contactUserId) {
  const entry = userContacts.get(userId);
  if (!entry) return false;
  entry.pinned.delete(contactUserId);
  return true;
}

/**
 * Hide a contact so they don't appear in the pushed list.
 * @param {string} userId
 * @param {string} contactUserId
 * @returns {boolean}
 */
export function hideContact(userId, contactUserId) {
  const entry = getOrCreate(userId);
  entry.hidden.add(contactUserId);
  return true;
}

/**
 * Unhide a previously hidden contact.
 * @param {string} userId
 * @param {string} contactUserId
 * @returns {boolean}
 */
export function unhideContact(userId, contactUserId) {
  const entry = userContacts.get(userId);
  if (!entry) return false;
  entry.hidden.delete(contactUserId);
  return true;
}

/**
 * Clean up when a user's last connection disconnects.
 * Auto-prunes contacts with no interaction within contactAutoPruneDays,
 * preserving pinned contacts.  Removes the entry entirely if empty.
 *
 * @param {string} userId
 */
export function onDisconnect(userId) {
  const entry = userContacts.get(userId);
  if (!entry) return;

  const now = Date.now();
  const cutoff = now - config.contactAutoPruneDays * 24 * 60 * 60 * 1000;

  for (const [uid, ts] of entry.lastInteraction) {
    if (ts < cutoff && !entry.pinned.has(uid)) {
      entry.contacts.delete(uid);
      entry.pinned.delete(uid);
      entry.hidden.delete(uid);
      entry.lastInteraction.delete(uid);
    }
  }

  if (entry.contacts.size === 0) {
    userContacts.delete(userId);
  }
}
