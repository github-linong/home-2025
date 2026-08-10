import { createReadStream, readFileSync } from "node:fs";
import { Router } from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAudioToolStatus,
  resolveWordAudio,
  synthesizeIpaWav,
} from "./audio.js";
import {
  THEMES,
  pickTheme,
  buildContent,
  applyToAuto,
  loadAuto,
  saveAuto,
} from "./generate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * learn-english is fully FILE-BACKED. Built-in content comes from the seed
 * JSON files (seed.json + seed-tech.json for decks/words/passages,
 * seed-ipa.json for IPA). Hourly auto-generated content lives in
 * data/learn/auto.json. NO Postgres dependency — works even when the DB is
 * down (which is exactly why this was rewritten: the old Postgres path
 * returned {"ok":false,"error":"generate_error"} whenever PG was offline).
 *
 * createLearnRouter takes no pool argument.
 */
export function createLearnRouter() {
  const router = Router();

  // ── Built-in seed content (loaded once at startup) ──────────────────────
  let SEED;
  try {
    const base = JSON.parse(readFileSync(join(__dirname, "seed.json"), "utf8"));
    const tech = JSON.parse(readFileSync(join(__dirname, "seed-tech.json"), "utf8"));
    const ipa = JSON.parse(readFileSync(join(__dirname, "seed-ipa.json"), "utf8"));
    SEED = {
      decks: [...(base.decks || []), ...(tech.decks || [])],
      words: [...(base.words || []), ...(tech.words || [])],
      passages: [...(base.passages || []), ...(tech.passages || [])],
      ipa,
    };
  } catch (err) {
    console.error("[api2] learn seed load failed (serving empty fallback):", err?.message || err);
    SEED = { decks: [], words: [], passages: [], ipa: { groups: [], practicePassages: [] } };
  }

  // ── Merged views (seed + auto), with stable integer ids the FE expects ──
  function mergedDecks() {
    const auto = loadAuto();
    const decks = [...SEED.decks, ...auto.decks];
    return decks.map((d, i) => ({
      ...d,
      id: i + 1,
      card_count: (d.cards || []).length,
      cards: (d.cards || []).map((c, ci) => ({ ...c, id: ci + 1 })),
    }));
  }

  function mergedPassages() {
    const auto = loadAuto();
    const passages = [...SEED.passages, ...auto.passages];
    return passages.map((p, i) => ({ ...p, id: i + 1 }));
  }

  /** lemma → word entry (seed words first, auto passage words override). */
  function wordMap() {
    const auto = loadAuto();
    const entries = [...SEED.words];
    for (const p of auto.passages) {
      for (const w of p.words || []) entries.push(w);
    }
    const map = new Map();
    entries.forEach((w, i) => {
      const lemma = String(w.lemma || "").toLowerCase().trim();
      if (lemma) map.set(lemma, { ...w, id: i + 1 });
    });
    return map;
  }

  function ipaGroups() {
    const groups = [];
    let sid = 0;
    for (const g of SEED.ipa.groups || []) {
      const symbols = (g.symbols || []).map((s) => {
        sid += 1;
        return {
          id: sid,
          group_id: groups.length + 1,
          symbol: s.symbol,
          name_zh: s.name_zh,
          tip: s.tip ?? null,
          examples: s.examples ?? null,
          voiced: typeof s.voiced === "boolean" ? s.voiced : null,
          sort_order: s.sort_order ?? 0,
        };
      });
      groups.push({
        id: groups.length + 1,
        slug: g.slug,
        title: g.title,
        description: g.description || "",
        sort_order: g.sort_order ?? 0,
        symbols,
      });
    }
    return groups;
  }

  // ── Decks ───────────────────────────────────────────────────────────────
  router.get("/decks", async (_req, res) => {
    try {
      const decks = mergedDecks().map(({ cards, ...meta }) => meta);
      res.json({ ok: true, decks });
    } catch (err) {
      console.error("[api2] GET /api/learn/decks failed:", err);
      res.status(500).json({ ok: false, error: "decks_error" });
    }
  });

  router.get("/decks/:slug/cards", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim();
      const deck = mergedDecks().find((d) => d.slug === slug);
      if (!deck) {
        return res.status(404).json({ ok: false, error: "deck_not_found" });
      }
      const { cards, ...meta } = deck;
      res.json({ ok: true, deck: meta, cards });
    } catch (err) {
      console.error("[api2] GET /api/learn/decks/:slug/cards failed:", err);
      res.status(500).json({ ok: false, error: "cards_error" });
    }
  });

  // ── Passages ────────────────────────────────────────────────────────────
  router.get("/passages", async (_req, res) => {
    try {
      const passages = mergedPassages().map(({ body, words, wordLemmas, ...meta }) => meta);
      res.json({ ok: true, passages });
    } catch (err) {
      console.error("[api2] GET /api/learn/passages failed:", err);
      res.status(500).json({ ok: false, error: "passages_error" });
    }
  });

  router.get("/passages/:slug", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim();
      const passage = mergedPassages().find((p) => p.slug === slug);
      if (!passage) {
        return res.status(404).json({ ok: false, error: "passage_not_found" });
      }
      const { words, wordLemmas, ...meta } = passage;
      let resolvedWords = Array.isArray(words) ? words : [];
      if (resolvedWords.length === 0 && Array.isArray(wordLemmas)) {
        const wm = wordMap();
        resolvedWords = wordLemmas
          .map((l) => wm.get(String(l).toLowerCase().trim()))
          .filter(Boolean);
      }
      // Ensure every word has a stable id (auto words ship without one).
      resolvedWords = resolvedWords.map((w, i) => ({ ...w, id: w.id ?? i + 1 }));
      res.json({ ok: true, passage: meta, words: resolvedWords });
    } catch (err) {
      console.error("[api2] GET /api/learn/passages/:slug failed:", err);
      res.status(500).json({ ok: false, error: "passage_error" });
    }
  });

  // ── Word dictionary lookup ──────────────────────────────────────────────
  router.get("/words", async (req, res) => {
    try {
      const q = String(req.query.q || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z'-]/g, "");
      if (!q) {
        return res.status(400).json({ ok: false, error: "missing_q" });
      }
      const word = wordMap().get(q);
      if (!word) {
        return res.status(404).json({ ok: false, error: "word_not_found", q });
      }
      res.json({ ok: true, word });
    } catch (err) {
      console.error("[api2] GET /api/learn/words failed:", err);
      res.status(500).json({ ok: false, error: "words_error" });
    }
  });

  // ── IPA ─────────────────────────────────────────────────────────────────
  router.get("/ipa", async (_req, res) => {
    try {
      res.json({ ok: true, groups: ipaGroups() });
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

  /** Word audio: Wiktionary/Lingua Libre (or dictionary CDN) first, else Piper/eSpeak. */
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

  // ── Material auto-generation endpoint ─────────────────────────────────────
  // Generates one themed flashcard deck + one reading passage and stores them
  // as `auto-*` content in data/learn/auto.json. Gated: loopback (local
  // automation / astro proxy) OR a set LEARN_ADMIN_TOKEN. Never exposed to
  // anonymous remote callers.
  const isLoopback = (ip) =>
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip === "0:0:0:0:0:0:0:1";

  function requireGenAuth(req, res, next) {
    const expected = process.env.LEARN_ADMIN_TOKEN;
    if (expected) {
      const token = req.get("x-admin-token") || "";
      if (token !== expected) return res.status(403).json({ ok: false, error: "forbidden" });
      return next();
    }
    const ip = req.ip || "";
    if (!isLoopback(ip)) {
      return res.status(403).json({ ok: false, error: "forbidden_loopback_only" });
    }
    return next();
  }

  // Serialize generation so concurrent calls can't double-write the same hour.
  let genChain = Promise.resolve();
  function runGenerate() {
    const run = genChain.then(async () => {
      const now = new Date();
      const theme = pickTheme(now);
      const content = await buildContent(theme, now);
      const auto = loadAuto();
      const summary = applyToAuto(auto, content.hourKey, content);
      saveAuto(auto);
      return {
        ...summary,
        theme: theme.key,
        themeLabel: theme.label,
        hour: content.hour,
        source: content.source,
      };
    });
    // Keep the chain alive even if a run rejects.
    genChain = run.catch(() => {});
    return run;
  }

  router.post("/generate", requireGenAuth, async (_req, res) => {
    try {
      const summary = await runGenerate();
      res.json({ ok: true, ...summary });
    } catch (err) {
      console.error("[api2] POST /api/learn/generate failed:", err);
      res.status(500).json({ ok: false, error: "generate_error" });
    }
  });

  // Manual trigger (handy from localhost browser); same gating as POST.
  router.get("/generate", requireGenAuth, async (_req, res) => {
    try {
      const summary = await runGenerate();
      res.json({ ok: true, ...summary });
    } catch (err) {
      console.error("[api2] GET /api/learn/generate failed:", err);
      res.status(500).json({ ok: false, error: "generate_error" });
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
