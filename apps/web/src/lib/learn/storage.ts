/** localStorage persistence for learn-english progress. Keys are versioned. */

import type { AnnotationMap, CardProgress } from "./types";

export const STORAGE_CARDS = "learn-english:card-progress:v1";
export const STORAGE_ANNOTATIONS = "learn-english:annotations:v1";

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode — progress simply won't persist */
  }
}

export const loadProgress = (): CardProgress => loadJson(STORAGE_CARDS, {});
export const saveProgress = (p: CardProgress) => saveJson(STORAGE_CARDS, p);

export const loadAnnotations = (): AnnotationMap => loadJson(STORAGE_ANNOTATIONS, {});
export const saveAnnotations = (a: AnnotationMap) => saveJson(STORAGE_ANNOTATIONS, a);

/** Stable per-card key so progress survives card re-ordering. */
export const progressKey = (deckSlug: string, cardId: number) => `${deckSlug}:${cardId}`;
