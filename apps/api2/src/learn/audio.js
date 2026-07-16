/**
 * Learn English audio: human pronunciations (Wiktionary/Commons) + TTS fallback.
 *
 * Priority for words: Wiktionary media → Free Dictionary audio → Piper TTS → eSpeak-ng
 * For IPA symbols: eSpeak-ng phoneme mode (preferred) → Piper spelling fallback
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "../../data/learn-audio");
const USER_AGENT =
  process.env.LEARN_AUDIO_UA ||
  "lilnong-learn-audio/0.1 (personal site; https://www.lilnong.top; contact lilnong1@126.com)";

const ESPEAK_BIN = process.env.ESPEAK_BIN || "espeak-ng";
const PIPER_BIN = process.env.PIPER_BIN || "piper";
const PIPER_MODEL =
  process.env.PIPER_MODEL ||
  join(__dirname, "../../data/piper-voices/en_US-lessac-medium.onnx");

/** @type {Map<string, Promise<{ url: string, source: string } | null>>} */
const humanLookupInflight = new Map();

async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cacheKey(kind, value) {
  return createHash("sha1").update(`${kind}:${value}`).digest("hex");
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ input?: string, timeoutMs?: number }} [opts]
 */
function runCommand(command, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = [];
    const errChunks = [];
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.stdout.on("data", (d) => chunks.push(d));
    child.stderr.on("data", (d) => errChunks.push(d));
    child.on("error", (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(
          new Error(
            `${command} exited ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 400)}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    if (opts.input != null) {
      child.stdin.end(opts.input);
    } else {
      child.stdin.end();
    }
  });
}

export async function whichBinary(name) {
  try {
    await runCommand("which", [name], { timeoutMs: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function getAudioToolStatus() {
  const espeak = await whichBinary(ESPEAK_BIN);
  const piper = (await whichBinary(PIPER_BIN)) && (await fileExists(PIPER_MODEL));
  return {
    espeak,
    piper,
    espeakBin: ESPEAK_BIN,
    piperBin: PIPER_BIN,
    piperModel: PIPER_MODEL,
    cacheDir: CACHE_DIR,
  };
}

/**
 * Fetch with timeout + UA. Returns null on network failure.
 * @param {string} url
 * @param {number} [timeoutMs]
 */
async function fetchText(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchBinary(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, contentType: res.headers.get("content-type") || "audio/ogg" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function commonsFileUrl(title) {
  // title like "File:En-us-cat.ogg" or "En-us-cat.ogg"
  const name = title.replace(/^File:/i, "").trim().replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}`;
}

function isLikelyEnglishPronunciation(title) {
  const t = title.toLowerCase();
  if (!/\.(ogg|oga|wav|mp3|flac|opus)$/i.test(t)) return false;
  // Prefer English / Lingua Libre English recordings
  if (t.includes("lingua libre") || t.includes("ll-q1860")) return true;
  if (/\ben[-_](us|uk|gb|ca|au)\b/.test(t)) return true;
  if (t.startsWith("en-") || t.includes("-en-") || t.includes("_en_")) return true;
  if (t.includes("pronunciation") && t.includes("eng")) return true;
  return /\.(ogg|wav|mp3)$/i.test(t);
}

/**
 * Resolve a human pronunciation URL for a lemma via Wiktionary media-list,
 * falling back to Free Dictionary API (often Wiktionary-sourced CDN audio).
 * @param {string} lemma
 * @returns {Promise<{ url: string, source: string } | null>}
 */
export async function resolveHumanAudio(lemma) {
  const word = String(lemma || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z'-]/g, "");
  if (!word) return null;

  const inflight = humanLookupInflight.get(word);
  if (inflight) return inflight;

  const promise = (async () => {
    // 1) Wiktionary REST media-list
    const mediaRaw = await fetchText(
      `https://en.wiktionary.org/api/rest_v1/page/media-list/${encodeURIComponent(word)}`,
    );
    if (mediaRaw) {
      try {
        const media = JSON.parse(mediaRaw);
        const items = Array.isArray(media?.items) ? media.items : [];
        const audio = items.find(
          (it) =>
            it?.type === "audio" &&
            typeof it.title === "string" &&
            isLikelyEnglishPronunciation(it.title),
        );
        if (audio?.title) {
          return { url: commonsFileUrl(audio.title), source: "wiktionary" };
        }
        // Some entries expose original.url
        const withUrl = items.find(
          (it) =>
            it?.type === "audio" &&
            typeof it?.original?.source === "string" &&
            /\.(ogg|oga|wav|mp3)/i.test(it.original.source),
        );
        if (withUrl?.original?.source) {
          return { url: withUrl.original.source, source: "wiktionary" };
        }
      } catch {
        /* ignore parse errors */
      }
    }

    // 2) MediaWiki images prop (Lingua Libre / en-us-*.ogg often listed)
    const wikiRaw = await fetchText(
      `https://en.wiktionary.org/w/api.php?action=query&format=json&prop=images&imlimit=40&titles=${encodeURIComponent(word)}`,
    );
    if (wikiRaw) {
      try {
        const data = JSON.parse(wikiRaw);
        const pages = data?.query?.pages || {};
        for (const page of Object.values(pages)) {
          const images = Array.isArray(page?.images) ? page.images : [];
          const hit = images.find((img) => isLikelyEnglishPronunciation(img.title || ""));
          if (hit?.title) {
            return { url: commonsFileUrl(hit.title), source: "wiktionary" };
          }
        }
      } catch {
        /* ignore */
      }
    }

    // 3) Free Dictionary API — often mirrors Wiktionary pronunciation audio
    const dictRaw = await fetchText(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    );
    if (dictRaw) {
      try {
        const entries = JSON.parse(dictRaw);
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            for (const p of entry.phonetics || []) {
              if (typeof p.audio === "string" && p.audio.startsWith("http")) {
                return { url: p.audio, source: "dictionaryapi" };
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    return null;
  })();

  humanLookupInflight.set(word, promise);
  try {
    return await promise;
  } finally {
    humanLookupInflight.delete(word);
  }
}

/**
 * Synthesize IPA (or approximate) with eSpeak-ng phoneme notation.
 * @param {string} symbol IPA without slashes, e.g. "æ" or "iː"
 */
export async function synthesizeIpaWav(symbol) {
  const clean = String(symbol || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean) throw new Error("empty_symbol");

  await ensureCacheDir();
  const key = cacheKey("ipa", clean);
  const outPath = join(CACHE_DIR, `ipa-${key}.wav`);
  if (await fileExists(outPath)) {
    return { path: outPath, source: "cache", engine: "espeak-ng" };
  }

  // eSpeak phoneme mode: [[...]]
  const phonemeText = `[[${clean}]]`;
  try {
    await runCommand(
      ESPEAK_BIN,
      ["-v", "en", "-w", outPath, "--", phonemeText],
      { timeoutMs: 10000 },
    );
    return { path: outPath, source: "tts", engine: "espeak-ng" };
  } catch (err) {
    // Fallback: speak a short English keyword if phoneme mode fails
    const approx = approximateWordForIpa(clean);
    if (approx) {
      await runCommand(ESPEAK_BIN, ["-v", "en", "-w", outPath, "--", approx], {
        timeoutMs: 10000,
      });
      return { path: outPath, source: "tts", engine: "espeak-ng-approx" };
    }
    throw err;
  }
}

/** Minimal mapping so IPA chips still make a sound if phoneme mode chokes. */
function approximateWordForIpa(symbol) {
  const map = {
    iː: "sheep",
    ɪ: "ship",
    e: "bed",
    æ: "cat",
    ə: "about",
    "ɜː": "bird",
    ʌ: "cup",
    ʊ: "book",
    uː: "food",
    ɒ: "hot",
    "ɔː": "law",
    "ɑː": "car",
    eɪ: "day",
    aɪ: "my",
    ɔɪ: "boy",
    əʊ: "go",
    aʊ: "now",
    ɪə: "ear",
    eə: "air",
    ʊə: "tour",
    θ: "think",
    ð: "this",
    ʃ: "ship",
    ʒ: "measure",
    tʃ: "chip",
    dʒ: "job",
    ŋ: "sing",
  };
  return map[symbol] || null;
}

/**
 * Synthesize a word with Piper (preferred) or eSpeak-ng.
 * @param {string} word
 */
export async function synthesizeWordWav(word) {
  const text = String(word || "")
    .trim()
    .replace(/[^a-zA-Z'\-\s]/g, "");
  if (!text) throw new Error("empty_word");

  await ensureCacheDir();
  const key = cacheKey("word-tts", text.toLowerCase());
  const outPath = join(CACHE_DIR, `word-${key}.wav`);
  if (await fileExists(outPath)) {
    return { path: outPath, source: "cache", engine: "tts" };
  }

  const hasPiper = (await whichBinary(PIPER_BIN)) && (await fileExists(PIPER_MODEL));
  if (hasPiper) {
    // piper reads text from stdin
    await new Promise((resolve, reject) => {
      const child = spawn(
        PIPER_BIN,
        ["--model", PIPER_MODEL, "--output_file", outPath],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      const errChunks = [];
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("piper timed out"));
      }, 30000);
      child.stderr.on("data", (d) => errChunks.push(d));
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(
            new Error(
              `piper exited ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 400)}`,
            ),
          );
          return;
        }
        resolve();
      });
      child.stdin.end(text);
    });
    return { path: outPath, source: "tts", engine: "piper" };
  }

  await runCommand(ESPEAK_BIN, ["-v", "en", "-w", outPath, "--", text], {
    timeoutMs: 10000,
  });
  return { path: outPath, source: "tts", engine: "espeak-ng" };
}

/**
 * Resolve word audio: prefer cached human file, else download human, else TTS.
 * @param {string} lemma
 * @returns {Promise<{ path?: string, redirectUrl?: string, source: string, engine?: string, contentType?: string }>}
 */
export async function resolveWordAudio(lemma) {
  const word = String(lemma || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z'-]/g, "");
  if (!word) throw new Error("empty_word");

  await ensureCacheDir();
  const humanKey = cacheKey("word-human", word);
  const humanMetaPath = join(CACHE_DIR, `human-${humanKey}.json`);
  const humanAudioPath = join(CACHE_DIR, `human-${humanKey}.bin`);

  if ((await fileExists(humanMetaPath)) && (await fileExists(humanAudioPath))) {
    const meta = JSON.parse(await readFile(humanMetaPath, "utf8"));
    return {
      path: humanAudioPath,
      source: meta.source || "human-cache",
      contentType: meta.contentType || "audio/ogg",
    };
  }

  const human = await resolveHumanAudio(word);
  if (human?.url) {
    const downloaded = await fetchBinary(human.url);
    if (downloaded?.buf?.length) {
      await writeFile(humanAudioPath, downloaded.buf);
      await writeFile(
        humanMetaPath,
        JSON.stringify({
          word,
          url: human.url,
          source: human.source,
          contentType: downloaded.contentType,
          savedAt: new Date().toISOString(),
        }),
      );
      return {
        path: humanAudioPath,
        source: human.source,
        contentType: downloaded.contentType,
      };
    }
    // Network download failed — still allow client redirect when possible
    return { redirectUrl: human.url, source: human.source };
  }

  const tts = await synthesizeWordWav(word);
  return { path: tts.path, source: tts.source, engine: tts.engine, contentType: "audio/wav" };
}

export { CACHE_DIR };
