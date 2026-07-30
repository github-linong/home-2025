/**
 * Shared types for the learn-english feature.
 * Shapes mirror the api2 `/api/learn/*` JSON responses (apps/api2/src/learn/routes.js).
 */

export type Card = {
  id: number;
  en: string;
  zh: string;
  hint: string | null;
  sort_order: number;
};

export type Deck = {
  id: number;
  slug: string;
  title: string;
  description: string;
  card_count?: number;
};

export type PassageMeta = {
  id: number;
  slug: string;
  title: string;
  level: string | null;
};

export type Passage = PassageMeta & { body: string };

export type Word = {
  id: number;
  lemma: string;
  phonetic: string | null;
  zh: string;
  pos: string | null;
  example: string | null;
};

export type IpaSymbol = {
  id: number;
  group_id: number;
  symbol: string;
  name_zh: string;
  tip: string | null;
  examples: string | null;
  voiced: boolean | null;
  sort_order: number;
};

export type IpaGroup = {
  id: number;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
  symbols: IpaSymbol[];
};

/** Per-card progress, keyed by `${deckSlug}:${cardId}`. */
export type CardProgress = Record<string, "know" | "unknown">;

/** Annotated lemmas per passage, keyed by passage slug. */
export type AnnotationMap = Record<string, string[]>;
