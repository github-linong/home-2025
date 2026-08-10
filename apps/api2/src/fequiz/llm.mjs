/**
 * Shared LLM client for the fequiz module (DashScope OpenAI-compatible).
 * Mirrors the same env wiring used by src/learn/refresh.mjs.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  // Works whether launched with --env-file or not.
  process.loadEnvFile?.(join(__dirname, "..", "..", ".env"));
} catch {
  /* env already provided */
}

export const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
export const LLM_ENDPOINT =
  process.env.DASHSCOPE_LLM_ENDPOINT ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
export const LLM_MODEL = process.env.DASHSCOPE_LLM_MODEL || "qwen-flash";
export const LLM_TIMEOUT_MS = 30000;

export function llmEnabled() {
  return Boolean(DASHSCOPE_API_KEY);
}

/** Extract the first JSON object (or array) out of an LLM reply. */
export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const arrStart = raw.indexOf("[");
  const arrEnd = raw.lastIndexOf("]");
  const tryObject = start >= 0 && end >= 0 && end > start;
  const tryArray = arrStart >= 0 && arrEnd >= 0 && arrEnd > arrStart;
  if (!tryObject && !tryArray) return null;
  // Prefer the outermost complete container.
  const pick = tryArray && (!tryObject || arrStart < start) ? [arrStart, arrEnd] : [start, end];
  try {
    return JSON.parse(raw.slice(pick[0], pick[1] + 1));
  } catch {
    return null;
  }
}

/**
 * @param {string} system
 * @param {string} user
 * @param {{temperature?: number, timeoutMs?: number, maxTokens?: number}} [opts]
 * @returns {Promise<{text: string, obj: any}|null>} null when the call fails.
 */
export async function callLlm(system, user, { temperature = 0.7, timeoutMs = LLM_TIMEOUT_MS, maxTokens } = {}) {
  if (!llmEnabled()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    if (!text) return null;
    return { text, obj: extractJson(text) };
  } catch (err) {
    console.error("[fequiz:llm] call failed:", err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
