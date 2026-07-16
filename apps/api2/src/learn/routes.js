import { createReadStream } from "node:fs";
import { Router } from "express";
import {
  getAudioToolStatus,
  resolveWordAudio,
  synthesizeIpaWav,
} from "./audio.js";

/**
 * @param {import("pg").Pool} pool
 */
export function createLearnRouter(pool) {
  const router = Router();

  router.get("/decks", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT d.id, d.slug, d.title, d.description,
                count(c.id)::int AS card_count
         FROM learn_decks d
         LEFT JOIN learn_cards c ON c.deck_id = d.id
         GROUP BY d.id
         ORDER BY d.id ASC`,
      );
      res.json({ ok: true, decks: rows });
    } catch (err) {
      console.error("[api2] GET /api/learn/decks failed:", err);
      res.status(500).json({ ok: false, error: "decks_error" });
    }
  });

  router.get("/decks/:slug/cards", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim();
      const deckRes = await pool.query(
        `SELECT id, slug, title, description FROM learn_decks WHERE slug = $1`,
        [slug],
      );
      if (!deckRes.rows[0]) {
        return res.status(404).json({ ok: false, error: "deck_not_found" });
      }
      const deck = deckRes.rows[0];
      const cardsRes = await pool.query(
        `SELECT id, en, zh, hint, sort_order
         FROM learn_cards
         WHERE deck_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [deck.id],
      );
      res.json({ ok: true, deck, cards: cardsRes.rows });
    } catch (err) {
      console.error("[api2] GET /api/learn/decks/:slug/cards failed:", err);
      res.status(500).json({ ok: false, error: "cards_error" });
    }
  });

  router.get("/passages", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, slug, title, level
         FROM learn_passages
         ORDER BY id ASC`,
      );
      res.json({ ok: true, passages: rows });
    } catch (err) {
      console.error("[api2] GET /api/learn/passages failed:", err);
      res.status(500).json({ ok: false, error: "passages_error" });
    }
  });

  router.get("/passages/:slug", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim();
      const passageRes = await pool.query(
        `SELECT id, slug, title, body, level
         FROM learn_passages
         WHERE slug = $1`,
        [slug],
      );
      if (!passageRes.rows[0]) {
        return res.status(404).json({ ok: false, error: "passage_not_found" });
      }
      const passage = passageRes.rows[0];
      const wordsRes = await pool.query(
        `SELECT w.id, w.lemma, w.phonetic, w.zh, w.pos, w.example
         FROM learn_passage_words pw
         JOIN learn_words w ON w.id = pw.word_id
         WHERE pw.passage_id = $1
         ORDER BY w.lemma ASC`,
        [passage.id],
      );
      res.json({ ok: true, passage, words: wordsRes.rows });
    } catch (err) {
      console.error("[api2] GET /api/learn/passages/:slug failed:", err);
      res.status(500).json({ ok: false, error: "passage_error" });
    }
  });

  router.get("/words", async (req, res) => {
    try {
      const q = String(req.query.q || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z'-]/g, "");
      if (!q) {
        return res.status(400).json({ ok: false, error: "missing_q" });
      }
      const { rows } = await pool.query(
        `SELECT id, lemma, phonetic, zh, pos, example
         FROM learn_words
         WHERE lemma = $1
         LIMIT 1`,
        [q],
      );
      if (!rows[0]) {
        return res.status(404).json({ ok: false, error: "word_not_found", q });
      }
      res.json({ ok: true, word: rows[0] });
    } catch (err) {
      console.error("[api2] GET /api/learn/words failed:", err);
      res.status(500).json({ ok: false, error: "words_error" });
    }
  });

  router.get("/ipa", async (_req, res) => {
    try {
      const groupsRes = await pool.query(
        `SELECT id, slug, title, description, sort_order
         FROM learn_ipa_groups
         ORDER BY sort_order ASC, id ASC`,
      );
      const symbolsRes = await pool.query(
        `SELECT id, group_id, symbol, name_zh, tip, examples, voiced, sort_order
         FROM learn_ipa_symbols
         ORDER BY sort_order ASC, id ASC`,
      );
      const byGroup = new Map();
      for (const g of groupsRes.rows) {
        byGroup.set(g.id, { ...g, symbols: [] });
      }
      for (const s of symbolsRes.rows) {
        const group = byGroup.get(s.group_id);
        if (group) group.symbols.push(s);
      }
      res.json({ ok: true, groups: [...byGroup.values()] });
    } catch (err) {
      console.error("[api2] GET /api/learn/ipa failed:", err);
      res.status(500).json({ ok: false, error: "ipa_error" });
    }
  });

  router.get("/audio/status", async (_req, res) => {
    try {
      const tools = await getAudioToolStatus();
      res.json({ ok: true, tools });
    } catch (err) {
      console.error("[api2] GET /api/learn/audio/status failed:", err);
      res.status(500).json({ ok: false, error: "audio_status_error" });
    }
  });

  /** IPA symbol → wav (eSpeak-ng). Query: ?s=æ or ?symbol=æ */
  router.get("/audio/ipa", async (req, res) => {
    try {
      const symbol = String(req.query.s || req.query.symbol || "").trim();
      if (!symbol) {
        return res.status(400).json({ ok: false, error: "missing_symbol" });
      }
      const result = await synthesizeIpaWav(symbol);
      res.set({
        "Content-Type": "audio/wav",
        "Cache-Control": "public, max-age=86400",
        "X-Audio-Source": result.source,
        "X-Audio-Engine": result.engine || "espeak-ng",
      });
      createReadStream(result.path).pipe(res);
    } catch (err) {
      console.error("[api2] GET /api/learn/audio/ipa failed:", err);
      const missing = /ENOENT|not found|which/i.test(String(err?.message || err));
      res.status(missing ? 503 : 500).json({
        ok: false,
        error: missing ? "espeak_unavailable" : "ipa_audio_error",
        message: String(err?.message || err).slice(0, 200),
      });
    }
  });

  /**
   * Word audio: Wiktionary/Lingua Libre (or dictionary CDN) first, else Piper/eSpeak.
   * Query: ?q=cat
   */
  router.get("/audio/word", async (req, res) => {
    try {
      const q = String(req.query.q || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z'-]/g, "");
      if (!q) {
        return res.status(400).json({ ok: false, error: "missing_q" });
      }
      const result = await resolveWordAudio(q);
      if (result.redirectUrl && !result.path) {
        res.set({
          "Cache-Control": "public, max-age=3600",
          "X-Audio-Source": result.source,
        });
        return res.redirect(302, result.redirectUrl);
      }
      if (!result.path) {
        return res.status(404).json({ ok: false, error: "audio_not_found" });
      }
      res.set({
        "Content-Type": result.contentType || "audio/wav",
        "Cache-Control": "public, max-age=86400",
        "X-Audio-Source": result.source,
        ...(result.engine ? { "X-Audio-Engine": result.engine } : {}),
      });
      createReadStream(result.path).pipe(res);
    } catch (err) {
      console.error("[api2] GET /api/learn/audio/word failed:", err);
      const missing = /ENOENT|not found|espeak|piper/i.test(String(err?.message || err));
      res.status(missing ? 503 : 500).json({
        ok: false,
        error: missing ? "tts_unavailable" : "word_audio_error",
        message: String(err?.message || err).slice(0, 200),
      });
    }
  });

  return router;
}

/** Normalize a clicked token into a lookup lemma. Exported for unit tests. */
export function normalizeLemma(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z'-]/g, "");
}
