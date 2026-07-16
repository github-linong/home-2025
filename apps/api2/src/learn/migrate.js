/**
 * Create learn_* tables and upsert built-in English learning content.
 * Idempotent: safe to re-run.
 *
 * Usage: npm run learn:migrate --prefix apps/api2
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL || process.env.API2_DATABASE_URL || "";
if (!databaseUrl) {
  console.error("DATABASE_URL (or API2_DATABASE_URL) is required");
  process.exit(1);
}

const schemaSql = readFileSync(join(__dirname, "schema.sql"), "utf8");
const schemaIpaSql = readFileSync(join(__dirname, "schema-ipa.sql"), "utf8");
const seed = JSON.parse(readFileSync(join(__dirname, "seed.json"), "utf8"));
const seedIpa = JSON.parse(readFileSync(join(__dirname, "seed-ipa.json"), "utf8"));

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(schemaSql);
  await client.query(schemaIpaSql);

  for (const deck of seed.decks) {
    const deckRes = await client.query(
      `INSERT INTO learn_decks (slug, title, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             description = EXCLUDED.description
       RETURNING id`,
      [deck.slug, deck.title, deck.description || ""],
    );
    const deckId = deckRes.rows[0].id;

    await client.query(`DELETE FROM learn_cards WHERE deck_id = $1`, [deckId]);

    for (const card of deck.cards) {
      await client.query(
        `INSERT INTO learn_cards (deck_id, en, zh, hint, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [deckId, card.en, card.zh, card.hint ?? null, card.sort_order ?? 0],
      );
    }
  }

  // IPA groups + symbols, and a flashcard deck generated from symbols (non-alphabet).
  const ipaDeckCards = [];
  let ipaCardOrder = 0;

  for (const group of seedIpa.groups) {
    const groupRes = await client.query(
      `INSERT INTO learn_ipa_groups (slug, title, description, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             description = EXCLUDED.description,
             sort_order = EXCLUDED.sort_order
       RETURNING id`,
      [group.slug, group.title, group.description || "", group.sort_order ?? 0],
    );
    const groupId = groupRes.rows[0].id;

    await client.query(`DELETE FROM learn_ipa_symbols WHERE group_id = $1`, [groupId]);

    for (const sym of group.symbols || []) {
      await client.query(
        `INSERT INTO learn_ipa_symbols
           (group_id, symbol, name_zh, tip, examples, voiced, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          groupId,
          sym.symbol,
          sym.name_zh,
          sym.tip ?? null,
          sym.examples ?? null,
          typeof sym.voiced === "boolean" ? sym.voiced : null,
          sym.sort_order ?? 0,
        ],
      );

      if (group.slug !== "alphabet") {
        ipaCardOrder += 1;
        ipaDeckCards.push({
          en: `/${sym.symbol}/`,
          zh: `${group.title.replace(/（.*）/, "").trim()} · ${sym.name_zh}`,
          hint: [sym.tip, sym.examples ? `例：${sym.examples}` : null]
            .filter(Boolean)
            .join(" "),
          sort_order: ipaCardOrder,
        });
      }
    }
  }

  // Alphabet flashcards as their own deck
  const alphabetGroup = seedIpa.groups.find((g) => g.slug === "alphabet");
  if (alphabetGroup) {
    const alphaDeckRes = await client.query(
      `INSERT INTO learn_decks (slug, title, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             description = EXCLUDED.description
       RETURNING id`,
      [
        "alphabet-sounds",
        "字母读音 Aa–Zz",
        "26 个英文字母名称读音（与拼音不同）。",
      ],
    );
    const alphaDeckId = alphaDeckRes.rows[0].id;
    await client.query(`DELETE FROM learn_cards WHERE deck_id = $1`, [alphaDeckId]);
    for (const sym of alphabetGroup.symbols) {
      await client.query(
        `INSERT INTO learn_cards (deck_id, en, zh, hint, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          alphaDeckId,
          sym.name_zh,
          `/${sym.symbol}/`,
          sym.tip ?? null,
          sym.sort_order ?? 0,
        ],
      );
    }
  }

  if (ipaDeckCards.length) {
    const ipaDeckRes = await client.query(
      `INSERT INTO learn_decks (slug, title, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             description = EXCLUDED.description
       RETURNING id`,
      [
        "ipa-symbols",
        "国际音标速记",
        "整理自《英语国际音标课》讲义：元音、双元音与辅音。",
      ],
    );
    const ipaDeckId = ipaDeckRes.rows[0].id;
    await client.query(`DELETE FROM learn_cards WHERE deck_id = $1`, [ipaDeckId]);
    for (const card of ipaDeckCards) {
      await client.query(
        `INSERT INTO learn_cards (deck_id, en, zh, hint, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [ipaDeckId, card.en, card.zh, card.hint, card.sort_order],
      );
    }
  }

  const lemmaToId = new Map();
  for (const word of seed.words) {
    const lemma = String(word.lemma).toLowerCase().trim();
    const wordRes = await client.query(
      `INSERT INTO learn_words (lemma, phonetic, zh, pos, example)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (lemma) DO UPDATE
         SET phonetic = EXCLUDED.phonetic,
             zh = EXCLUDED.zh,
             pos = EXCLUDED.pos,
             example = EXCLUDED.example
       RETURNING id`,
      [lemma, word.phonetic ?? null, word.zh, word.pos ?? null, word.example ?? null],
    );
    lemmaToId.set(lemma, wordRes.rows[0].id);
  }

  const allPassages = [
    ...(seed.passages || []),
    ...(seedIpa.practicePassages || []),
  ];

  for (const passage of allPassages) {
    const passageRes = await client.query(
      `INSERT INTO learn_passages (slug, title, body, level)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             body = EXCLUDED.body,
             level = EXCLUDED.level
       RETURNING id`,
      [passage.slug, passage.title, passage.body, passage.level ?? null],
    );
    const passageId = passageRes.rows[0].id;

    await client.query(`DELETE FROM learn_passage_words WHERE passage_id = $1`, [passageId]);

    for (const rawLemma of passage.wordLemmas || []) {
      const lemma = String(rawLemma).toLowerCase().trim();
      const wordId = lemmaToId.get(lemma);
      if (!wordId) {
        console.warn(`[learn:migrate] unknown lemma "${lemma}" for passage ${passage.slug}`);
        continue;
      }
      await client.query(
        `INSERT INTO learn_passage_words (passage_id, word_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [passageId, wordId],
      );
    }
  }

  await client.query("COMMIT");

  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM learn_decks) AS decks,
      (SELECT count(*)::int FROM learn_cards) AS cards,
      (SELECT count(*)::int FROM learn_passages) AS passages,
      (SELECT count(*)::int FROM learn_words) AS words,
      (SELECT count(*)::int FROM learn_ipa_groups) AS ipa_groups,
      (SELECT count(*)::int FROM learn_ipa_symbols) AS ipa_symbols
  `);
  console.log("[learn:migrate] OK", counts.rows[0]);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("[learn:migrate] failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
