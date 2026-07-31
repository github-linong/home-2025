/** Deterministic daily pick for the 每日 5 词 panel. */

import { DAILY_WORDS, type DailyWord } from "../../data/daily-words";

export const DAILY_COUNT = 5;

/** Local calendar day as YYYY-MM-DD (not UTC — the panel should flip at local midnight). */
export function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Days since epoch, used as the rotation offset. */
function dayIndex(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Pick today's words by walking a fixed stride through the pool, so every word
 * appears once per full cycle instead of resampling at random.
 */
export function pickDailyWords(dayKey = localDayKey(), count = DAILY_COUNT): DailyWord[] {
  const total = DAILY_WORDS.length;
  const start = ((dayIndex(dayKey) * count) % total + total) % total;
  return Array.from({ length: Math.min(count, total) }, (_, i) => DAILY_WORDS[(start + i) % total]);
}

/** How many days until the pool starts over — shown as "第 N 天 / 共 M 天". */
export function cycleInfo(dayKey = localDayKey(), count = DAILY_COUNT) {
  const totalDays = Math.ceil(DAILY_WORDS.length / count);
  const day = (((dayIndex(dayKey) % totalDays) + totalDays) % totalDays) + 1;
  return { day, totalDays };
}
