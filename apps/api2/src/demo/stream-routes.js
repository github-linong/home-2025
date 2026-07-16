import { Router } from "express";

/** Default mock "model" answer used when the client does not send `prompt`. */
export const DEFAULT_STREAM_TEXT =
  "Streaming is not about making the model faster — it is about showing the first token sooner. " +
  "Fetch gives you response.body as a ReadableStream. Read chunks with getReader(), decode with TextDecoder({ stream: true }), " +
  "and flush UI updates with requestAnimationFrame so React does not re-render on every byte.";

/**
 * Split text into small token-like pieces (words + trailing space / punctuation).
 * Keeps the demo readable without requiring a real tokenizer.
 */
export function tokenizeForStream(text) {
  const source = String(text ?? "");
  if (!source) return [];
  return source.match(/\S+\s*|\s+/g) ?? [source];
}

/**
 * Write tokens to an Express response as a plain-text byte stream.
 * Uses res.write so proxies can flush chunk-by-chunk (not one buffered body).
 */
export function writeTokenStream(res, tokens, { delayMs = 40 } = {}) {
  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Hint nginx / intermediaries not to buffer the whole response.
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  let index = 0;
  let closed = false;

  const cleanup = () => {
    closed = true;
    if (timer) clearTimeout(timer);
  };

  res.on("close", cleanup);

  let timer = null;
  const pump = () => {
    if (closed) return;
    if (index >= tokens.length) {
      res.end();
      return;
    }
    res.write(tokens[index]);
    index += 1;
    timer = setTimeout(pump, delayMs);
  };

  pump();
}

/**
 * Demo routes for Fetch ReadableStream / typewriter experiments.
 * Mounted at /api/demo
 */
export function createDemoRouter() {
  const router = Router();

  /**
   * GET /api/demo/llm-stream?delayMs=40&prompt=...
   * Returns a text/plain stream that mimics token-by-token model output.
   */
  router.get("/llm-stream", (req, res) => {
    const delayRaw = Number(req.query.delayMs);
    const delayMs = Number.isFinite(delayRaw)
      ? Math.min(200, Math.max(0, delayRaw))
      : 40;
    const prompt = typeof req.query.prompt === "string" ? req.query.prompt.trim() : "";
    const text = prompt
      ? `You asked: ${prompt}\n\n${DEFAULT_STREAM_TEXT}`
      : DEFAULT_STREAM_TEXT;
    const tokens = tokenizeForStream(text);
    writeTokenStream(res, tokens, { delayMs });
  });

  return router;
}
