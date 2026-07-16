-- English IPA phonetics tables (idempotent)

CREATE TABLE IF NOT EXISTS learn_ipa_groups (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS learn_ipa_symbols (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES learn_ipa_groups (id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  tip TEXT,
  examples TEXT,
  voiced BOOLEAN,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (group_id, symbol)
);

CREATE INDEX IF NOT EXISTS learn_ipa_symbols_group_id_idx
  ON learn_ipa_symbols (group_id, sort_order);
