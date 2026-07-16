-- English learning content tables (idempotent)

CREATE TABLE IF NOT EXISTS learn_decks (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS learn_cards (
  id SERIAL PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES learn_decks (id) ON DELETE CASCADE,
  en TEXT NOT NULL,
  zh TEXT NOT NULL,
  hint TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS learn_cards_deck_id_idx ON learn_cards (deck_id, sort_order);

CREATE TABLE IF NOT EXISTS learn_passages (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  level TEXT
);

CREATE TABLE IF NOT EXISTS learn_words (
  id SERIAL PRIMARY KEY,
  lemma TEXT NOT NULL UNIQUE,
  phonetic TEXT,
  zh TEXT NOT NULL,
  pos TEXT,
  example TEXT
);

CREATE TABLE IF NOT EXISTS learn_passage_words (
  passage_id INTEGER NOT NULL REFERENCES learn_passages (id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES learn_words (id) ON DELETE CASCADE,
  PRIMARY KEY (passage_id, word_id)
);

CREATE INDEX IF NOT EXISTS learn_words_lemma_idx ON learn_words (lemma);
