/** Thin client for the api2 `/api/learn/*` endpoints. */

import type { Card, Deck, IpaGroup, Passage, PassageMeta, Word } from "./types";

async function apiJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  const text = await res.text();
  let data: T & { ok?: boolean; error?: string };
  try {
    data = JSON.parse(text) as T & { ok?: boolean; error?: string };
  } catch {
    throw new Error(
      text.trim() ? `invalid_json (${res.status})` : `empty_response (${res.status})`,
    );
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export const learnApi = {
  decks: () => apiJson<{ decks: Deck[] }>("/api/learn/decks").then((d) => d.decks),

  deckCards: (slug: string) =>
    apiJson<{ deck: Deck; cards: Card[] }>(
      `/api/learn/decks/${encodeURIComponent(slug)}/cards`,
    ),

  passages: () =>
    apiJson<{ passages: PassageMeta[] }>("/api/learn/passages").then((d) => d.passages),

  passage: (slug: string) =>
    apiJson<{ passage: Passage; words: Word[] }>(
      `/api/learn/passages/${encodeURIComponent(slug)}`,
    ),

  /** Resolve a lemma to a dictionary entry (exact match server-side). */
  word: (q: string) =>
    apiJson<{ word: Word }>(`/api/learn/words?q=${encodeURIComponent(q)}`).then(
      (d) => d.word,
    ),

  ipaGroups: () => apiJson<{ groups: IpaGroup[] }>("/api/learn/ipa").then((d) => d.groups ?? []),
};

/** Audio endpoints stream binary (or 302 to a human recording). */
export const audioWordUrl = (word: string) =>
  `/api/learn/audio/word?q=${encodeURIComponent(word)}`;
export const audioIpaUrl = (symbol: string) =>
  `/api/learn/audio/ipa?s=${encodeURIComponent(symbol)}`;
