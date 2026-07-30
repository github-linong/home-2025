/**
 * Single-channel speech engine for learn-english.
 *
 * At most one audio source plays at a time: either an `Audio` element fed by the
 * api2 audio endpoints (human recording / Piper / eSpeak) or, when that fails,
 * the browser's built-in speechSynthesis. Rapid re-clicks are debounced and a
 * generation counter cancels stale async work (autoplay-block fallbacks, etc.).
 */

import { audioIpaUrl, audioWordUrl } from "./api";
import type { Card } from "./types";

/** IPA symbol → representative word so browser TTS can approximate a symbol. */
export const IPA_FALLBACK_WORD: Record<string, string> = {
  "iː": "sheep", ɪ: "ship", e: "bed", æ: "cat", ə: "about", "ɜː": "bird",
  ʌ: "cup", ʊ: "book", "uː": "food", ɒ: "hot", "ɔː": "law", "ɑː": "car",
  eɪ: "day", aɪ: "my", ɔɪ: "boy", əʊ: "go", aʊ: "now", ɪə: "ear",
  eə: "air", ʊə: "tour", θ: "think", ð: "this", ʃ: "ship", ʒ: "measure",
  tʃ: "chip", dʒ: "job", ŋ: "sing",
};

const PLAY_DEBOUNCE_MS = 350;

export type StatusReporter = (message: string, isError?: boolean) => void;

export function createAudioEngine(report: StatusReporter) {
  let currentAudio: HTMLAudioElement | null = null;
  let playGeneration = 0;
  let lastPlayAt = 0;

  function stopAllSpeech() {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.removeAttribute("src");
        currentAudio.load();
      } catch {
        /* ignore */
      }
      currentAudio = null;
    }
  }

  /** Bump the generation so in-flight playback resolves as stale, then stop. */
  function cancel() {
    playGeneration += 1;
    lastPlayAt = 0;
    stopAllSpeech();
  }

  function speakViaBrowser(text: string, lang: string, generation: number): boolean {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !text) return false;
      if (generation !== playGeneration) return false;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.9;
      u.onstart = () => {
        if (generation !== playGeneration) synth.cancel();
      };
      synth.speak(u);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Play an audio URL. On load error or autoplay block, fall back to browser
   * speech synthesis using `fallbackText`.
   */
  function playAudioUrl(url: string, fallbackText = "", lang = "en-US") {
    const now = Date.now();
    if (now - lastPlayAt < PLAY_DEBOUNCE_MS) return;
    lastPlayAt = now;

    const generation = ++playGeneration;
    stopAllSpeech();

    let settled = false;
    const stillCurrent = () => generation === playGeneration;

    const fallback = () => {
      if (settled || !stillCurrent()) return;
      settled = true;
      if (fallbackText && speakViaBrowser(fallbackText, lang, generation)) {
        report("后端音频不可用,已改用浏览器语音朗读。");
      } else if (stillCurrent()) {
        report("音频播放失败:后端未就绪,且当前浏览器不支持语音合成。", true);
      }
    };

    try {
      const audio = new Audio(url);
      currentAudio = audio;
      audio.addEventListener("playing", () => {
        if (!stillCurrent()) {
          audio.pause();
          return;
        }
        settled = true;
      });
      audio.addEventListener("error", () => {
        if (stillCurrent()) fallback();
      });
      audio
        .play()
        .then(() => {
          if (!stillCurrent()) {
            audio.pause();
            return;
          }
          settled = true;
        })
        .catch(() => {
          if (stillCurrent()) fallback();
        });
    } catch {
      fallback();
    }
  }

  /** Play an IPA symbol: api2 eSpeak first, else a representative word. */
  function playIpa(symbol: string) {
    const clean = String(symbol || "").replace(/[/[\]]/g, "").trim();
    if (!clean) return;
    playAudioUrl(audioIpaUrl(clean), IPA_FALLBACK_WORD[clean] || "");
  }

  /** Play a word: human recording / server TTS first, else browser speech. */
  function playWord(word: string) {
    const clean = String(word || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z'\- ]/g, "");
    if (!clean) return;
    playAudioUrl(audioWordUrl(clean), clean);
  }

  /** Choose the right audio for a flashcard based on its content. */
  function playCard(card: Card) {
    const en = (card.en || "").trim();
    const zh = (card.zh || "").trim();
    if (/^\/.*\/$/.test(en)) return playIpa(en);
    if (/^\/.*\/$/.test(zh)) return playIpa(zh);
    return playWord(en);
  }

  return { cancel, playIpa, playWord, playCard };
}

export type AudioEngine = ReturnType<typeof createAudioEngine>;
