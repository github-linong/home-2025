/**
 * Single source of truth for the current visitor's identity across every
 * realtime feature (chat, wander, poker). Historically each feature minted its
 * own id/name in its own localStorage key, so the same browser appeared as
 * three different people. Centralizing here guarantees one stable userId and
 * one display name everywhere.
 */

const UID_KEY = "ln_uid";
const NAME_KEY = "ln_display_name";

const ADJECTIVES = ["快乐的", "神秘的", "优雅的", "可爱的", "机智的", "勇敢的", "慵懒的", "调皮的", "温柔的", "酷炫的"];
const NOUNS = ["小猫", "熊猫", "狐狸", "企鹅", "海豚", "猫头鹰", "小鹿", "兔子", "松鼠", "考拉"];

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Stable per-browser userId, shared by chat / wander / poker. */
export function getUserId(): string {
  let id = safeLocalGet(UID_KEY);
  if (!id) {
    id = `u_${crypto.randomUUID().slice(0, 8)}`;
    safeLocalSet(UID_KEY, id);
    // Mirror to a cookie so any server-side dev auth that reads a uid cookie
    // keeps recognizing this browser.
    try {
      document.cookie = `ln_uid=${encodeURIComponent(id)}; path=/; max-age=31536000`;
    } catch {
      /* ignore */
    }
  }
  return id;
}

/**
 * Persistent display name, shared by chat / wander / poker. Migrates the legacy
 * chat guest name so existing visitors keep their name and it propagates to the
 * other features, then falls back to a friendly generated name so first-time
 * visitors aren't just "游客".
 */
export function getDisplayName(): string {
  let name = safeLocalGet(NAME_KEY);
  if (!name) {
    const legacy = safeLocalGet("ln_chat_guest_name");
    name = legacy || randomGuestName();
    safeLocalSet(NAME_KEY, name);
  }
  return name;
}

export function setDisplayName(name: string): void {
  safeLocalSet(NAME_KEY, name);
}

function randomGuestName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return adj + noun;
}

/** Backwards-compatible alias: wander & poker call this to get the dev userId. */
export function getOrCreateDevUserId(): string {
  return getUserId();
}
