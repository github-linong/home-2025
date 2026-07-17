/**
 * Named human and evolved-animal profiles for the novel setting board.
 * Data lives in src/data/novel-codex.json so other pages (e.g. the card
 * gallery post) can consume the same source of truth.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * @typedef {{
 *   name: string,
 *   aliases?: string,
 *   group: string,
 *   role: string,
 *   intro: string,
 *   tags: string[],
 *   image: string,
 * }} CharacterProfile
 */

/**
 * Resolved from the app root (same pattern as sf-answers in [slug].astro),
 * because Vite rewrites `new URL(..., import.meta.url)` into a dist asset URL.
 * @type {{ source: Record<string, string>, humans: CharacterProfile[], animals: CharacterProfile[] }}
 */
const codex = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/data/novel-codex.json"), "utf8"),
);

export const NOVEL_CODEX_SOURCE = codex.source;

/** @type {CharacterProfile[]} */
export const HUMAN_CHARACTER_PROFILES = codex.humans;

/** @type {CharacterProfile[]} */
export const ANIMAL_CHARACTER_PROFILES = codex.animals;

/**
 * @param {CharacterProfile[]} humans
 * @param {CharacterProfile[]} animals
 */
export function assertCharacterProfiles(humans, animals) {
  for (const [label, rows] of [
    ["human", humans],
    ["animal", animals],
  ]) {
    if (!Array.isArray(rows) || rows.length < 5) {
      throw new Error(`${label} profiles are incomplete`);
    }
    const names = new Set();
    for (const row of rows) {
      if (!row.name || !row.group || !row.role || !row.intro || !row.tags?.length) {
        throw new Error(`invalid ${label} profile: ${row.name || "unknown"}`);
      }
      if (!row.image || !row.image.startsWith("/images/novel-codex/")) {
        throw new Error(`missing portrait image for ${label} profile: ${row.name}`);
      }
      if (names.has(row.name)) throw new Error(`duplicate ${label} profile: ${row.name}`);
      names.add(row.name);
    }
  }
}
