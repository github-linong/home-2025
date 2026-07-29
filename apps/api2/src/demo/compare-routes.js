import { Router } from "express";
import crypto from "node:crypto";
import {
  readLlmEnv,
  createRateLimiter,
  iterateSseTextTokens,
} from "./stream-routes.js";

const MOCK_WORDS = [
  "前端", "开发", "技术", "对比", "演示", "请求", "方式", "单次",
  "流式", "长轮询", "全双工", "推送", "异步", "并发", "性能", "优化",
  "浏览器", "网络", "协议", "HTTP", "WebSocket", "EventSource", "Fetch",
  "XMLHttpRequest", "Beacon", "JSONP", "跨域", "实时", "数据", "传输",
];

const MAX_DELAY = 200;
const DEFAULT_DELAY = 30;
const LONG_POLL_DELAY = 1500;

const COMPARE_LLM_PROMPT =
  "用大约二十个中文词（可夹杂技术英文词）介绍浏览器请求技术对比，" +
  "词与词之间用空格分隔，不要标点，不要解释，不要换行。";

const COMPARE_LLM_SYSTEM =
  "你是对比演示用的短文生成器。只输出词序列，不要客套，不要 Markdown。";

/** Shared across WS upgrades so LLM rate limits actually apply. */
const wsLlmLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

function parseDelay(query) {
  const v = parseInt(query?.delay, 10);
  if (Number.isFinite(v) && v >= 0) return Math.min(v, MAX_DELAY);
  return DEFAULT_DELAY;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wantsLlm(req) {
  const header = String(req.get?.("x-source") || req.headers?.["x-source"] || "")
    .trim()
    .toLowerCase();
  if (header === "llm") return true;
  return String(req.query?.source || "").trim().toLowerCase() === "llm";
}

function clientKey(req) {
  return `compare-llm:${req.ip || req.socket?.remoteAddress || "unknown"}`;
}

/**
 * Open a DashScope chat completion stream. Throws errors with `.code`.
 */
async function openCompareLlmStream({ env, fetchImpl, signal }) {
  const cfg = readLlmEnv(env);
  if (!cfg.apiKey) {
    const err = new Error("DASHSCOPE_API_KEY is not configured");
    err.code = "llm_not_configured";
    throw err;
  }

  const upstream = await fetchImpl(cfg.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: COMPARE_LLM_SYSTEM },
        { role: "user", content: COMPARE_LLM_PROMPT },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 256,
    }),
    signal,
  });

  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 500);
    const err = new Error(`DashScope HTTP ${upstream.status}: ${detail}`);
    err.code = "llm_request_failed";
    throw err;
  }
  if (!upstream.body) {
    const err = new Error("DashScope returned no response body");
    err.code = "llm_request_failed";
    throw err;
  }
  return upstream;
}

async function collectLlmText(opts) {
  const upstream = await openCompareLlmStream(opts);
  let text = "";
  for await (const token of iterateSseTextTokens(upstream.body)) {
    text += token;
  }
  return text.trim();
}

function sendLlmError(res, error) {
  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }
  if (error?.code === "llm_not_configured") {
    res.status(503).json({
      ok: false,
      error: "llm_not_configured",
      message: "DASHSCOPE_API_KEY is not configured",
    });
    return;
  }
  if (error?.code === "rate_limited") {
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }
  console.error("[api2] compare llm failed:", error);
  res.status(502).json({
    ok: false,
    error: "llm_request_failed",
    message: "Compare LLM request failed",
  });
}

function writeChunk(res, chunk) {
  return new Promise((resolve, reject) => {
    res.write(chunk, "utf8", (err) => (err ? reject(err) : resolve()));
    if (typeof res.flush === "function") res.flush();
  });
}

/**
 * Create the compare demo router (HTTP routes).
 * WebSocket upgrade is handled separately via handleWsUpgrade().
 */
export function createCompareRouter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  maxRequests = 10,
  windowMs = 60_000,
} = {}) {
  const router = Router();
  const allowRequest = createRateLimiter({ maxRequests, windowMs });

  function guardLlm(req, res) {
    if (!allowRequest(clientKey(req))) {
      const err = new Error("rate limited");
      err.code = "rate_limited";
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      sendLlmError(res, err);
      return false;
    }
    return true;
  }

  // GET /once — single JSON response (used by XHR single + Fetch single)
  router.get("/once", async (req, res) => {
    if (!wantsLlm(req)) {
      res.json({
        text: MOCK_WORDS.slice(0, 10).join(""),
        ts: Date.now(),
        source: "mock",
      });
      return;
    }
    if (!guardLlm(req, res)) return;

    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", abortOnDisconnect);
    try {
      const text = await collectLlmText({
        env,
        fetchImpl,
        signal: controller.signal,
      });
      res.json({ text, ts: Date.now(), source: "llm" });
    } catch (error) {
      if (error?.name === "AbortError" && res.destroyed) return;
      sendLlmError(res, error);
    } finally {
      res.off("close", abortOnDisconnect);
    }
  });

  // GET /stream — chunked plain-text stream
  // ?design=1 (alias ?pad=1): Comet-style progressive XHR design —
  //   1) one ~2KB whitespace prelude so Chromium surfaces responseText in LOADING
  //   2) then newline-delimited words (no per-word padding)
  // Without design=1, Fetch still gets true TCP chunks; XHR may coalesce tiny writes.
  router.get("/stream", async (req, res) => {
    const delay = parseDelay(req.query);
    const progressiveDesign =
      req.query?.design === "1" || req.query?.pad === "1";

    if (wantsLlm(req)) {
      if (!guardLlm(req, res)) return;
      const controller = new AbortController();
      const abortOnDisconnect = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", abortOnDisconnect);
      try {
        const upstream = await openCompareLlmStream({
          env,
          fetchImpl,
          signal: controller.signal,
        });
        res.status(200);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("X-Source", "llm");
        res.flushHeaders();

        if (progressiveDesign) {
          await writeChunk(res, `${" ".repeat(2048)}\n`);
        }
        for await (const token of iterateSseTextTokens(upstream.body)) {
          if (res.writableEnded || res.destroyed) break;
          await writeChunk(res, progressiveDesign ? `${token}\n` : token);
          if (delay) await sleep(delay);
        }
        if (!res.writableEnded) res.end();
      } catch (error) {
        if (error?.name === "AbortError" && res.destroyed) return;
        sendLlmError(res, error);
      } finally {
        res.off("close", abortOnDisconnect);
      }
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    if (progressiveDesign) {
      await writeChunk(res, `${" ".repeat(2048)}\n`);
    }

    for (const word of MOCK_WORDS) {
      if (res.writableEnded || res.destroyed) break;
      await writeChunk(res, progressiveDesign ? `${word}\n` : word);
      await sleep(delay);
    }
    res.end();
  });

  // GET /sse — Server-Sent Events (used by SSE / EventSource card)
  router.get("/sse", async (req, res) => {
    const delay = parseDelay(req.query);

    if (wantsLlm(req)) {
      if (!guardLlm(req, res)) return;
      const controller = new AbortController();
      const abortOnDisconnect = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", abortOnDisconnect);
      try {
        const upstream = await openCompareLlmStream({
          env,
          fetchImpl,
          signal: controller.signal,
        });
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("X-Source", "llm");
        res.flushHeaders();

        let index = 0;
        for await (const token of iterateSseTextTokens(upstream.body)) {
          if (res.writableEnded || res.destroyed) break;
          res.write(`data: ${JSON.stringify({ word: token, index })}\n\n`);
          if (typeof res.flush === "function") res.flush();
          index += 1;
          if (delay) await sleep(delay);
        }
        if (!res.writableEnded) {
          res.write("data: [DONE]\n\n");
          res.end();
        }
      } catch (error) {
        if (error?.name === "AbortError" && res.destroyed) return;
        sendLlmError(res, error);
      } finally {
        res.off("close", abortOnDisconnect);
      }
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    for (let i = 0; i < MOCK_WORDS.length; i++) {
      if (res.writableEnded) break;
      res.write(`data: ${JSON.stringify({ word: MOCK_WORDS[i], index: i })}\n\n`);
      await sleep(delay);
    }
    if (!res.writableEnded) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });

  // GET /long-poll — delayed single JSON (pattern demo; always mock content)
  router.get("/long-poll", async (req, res) => {
    const seq = parseInt(req.query?.seq, 10) || 0;
    await sleep(LONG_POLL_DELAY);
    res.json({
      text: MOCK_WORDS[seq % MOCK_WORDS.length],
      ts: Date.now(),
      seq,
      source: "mock",
    });
  });

  // GET /jsonp — JSONP callback wrapper
  router.get("/jsonp", async (req, res) => {
    const cb = String(req.query?.callback || "callback").replace(/[^\w$]/g, "");
    const sendJsonp = (payload) => {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.send(`${cb}(${JSON.stringify(payload)});`);
    };

    if (!wantsLlm(req)) {
      sendJsonp({
        text: MOCK_WORDS.slice(0, 5).join(""),
        ts: Date.now(),
        source: "mock",
      });
      return;
    }
    if (!guardLlm(req, res)) return;

    try {
      const text = await collectLlmText({ env, fetchImpl });
      sendJsonp({ text, ts: Date.now(), source: "llm" });
    } catch (error) {
      // JSONP cannot surface HTTP error codes to the client callback reliably;
      // still return a script that invokes the callback with an error payload.
      if (error?.code === "llm_not_configured") {
        sendJsonp({
          ok: false,
          error: "llm_not_configured",
          message: "DASHSCOPE_API_KEY is not configured",
          ts: Date.now(),
          source: "llm",
        });
        return;
      }
      console.error("[api2] compare jsonp llm failed:", error);
      sendJsonp({
        ok: false,
        error: "llm_request_failed",
        message: "Compare LLM request failed",
        ts: Date.now(),
        source: "llm",
      });
    }
  });

  // GET /iframe-stream — Forever-Frame / Comet: chunked text/html with <script> tags
  router.get("/iframe-stream", async (req, res) => {
    const delay = parseDelay(req.query);
    const cb =
      String(req.query?.callback || "onIframeStream").replace(/[^\w$]/g, "") ||
      "onIframeStream";

    const startHtml = async () => {
      res.status(200);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      await writeChunk(
        res,
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>iframe-stream</title></head><body>` +
          `<!--${" ".repeat(2048)}-->\n`,
      );
    };

    const writeWord = async (word, i) => {
      const payload = JSON.stringify(word);
      await writeChunk(
        res,
        `<script>try{parent.${cb}&&parent.${cb}(${payload},${i})}catch(e){}</script>\n`,
      );
    };

    const finish = async () => {
      if (!res.writableEnded) {
        await writeChunk(
          res,
          `<script>try{parent.${cb}&&parent.${cb}(null,-1,"done")}catch(e){}</script>\n</body></html>`,
        );
        res.end();
      }
    };

    if (wantsLlm(req)) {
      if (!guardLlm(req, res)) return;
      const controller = new AbortController();
      const abortOnDisconnect = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.on("close", abortOnDisconnect);
      try {
        const upstream = await openCompareLlmStream({
          env,
          fetchImpl,
          signal: controller.signal,
        });
        res.setHeader("X-Source", "llm");
        await startHtml(); // flushHeaders after X-Source is set
        let index = 0;
        for await (const token of iterateSseTextTokens(upstream.body)) {
          if (res.writableEnded || res.destroyed) break;
          await writeWord(token, index);
          index += 1;
          if (delay) await sleep(delay);
        }
        await finish();
      } catch (error) {
        if (error?.name === "AbortError" && res.destroyed) return;
        sendLlmError(res, error);
      } finally {
        res.off("close", abortOnDisconnect);
      }
      return;
    }

    await startHtml();
    for (let i = 0; i < MOCK_WORDS.length; i++) {
      if (res.writableEnded || res.destroyed) break;
      await writeWord(MOCK_WORDS[i], i);
      await sleep(delay);
    }
    await finish();
  });

  // POST /beacon — fire-and-forget endpoint (navigator.sendBeacon)
  router.post("/beacon", (req, res) => {
    void req.body;
    res.status(204).end();
  });

  // GET /pixel — 1×1 GIF for <img src> tracking pixels (query = payload)
  const PIXEL_GIF = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
  router.get("/pixel", (req, res) => {
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store, no-cache");
    res.setHeader("Content-Length", String(PIXEL_GIF.length));
    void req.query;
    res.end(PIXEL_GIF);
  });

  // Capability probe for environment-constrained transports (no fake success).
  router.get("/capabilities", (_req, res) => {
    res.json({
      webTransport: {
        availableOnThisServer: false,
        clientApi: "WebTransport",
        requires: ["HTTPS secure context", "HTTP/3 (QUIC)", "WebTransport-capable origin"],
        note:
          "api2 is Express on HTTP/1.1 — cannot terminate WebTransport. Card does client feature-detect + connect attempt.",
      },
      http2Push: {
        availableOnThisServer: false,
        browserSupport: "removed",
        chromeRemoved: "106+",
        firefoxRemoved: "132+",
        note:
          "HTTP/2 Server Push is obsolete in major browsers. Prefer 103 Early Hints + Link rel=preload.",
        alternative: "103 Early Hints / <link rel=preload>",
      },
      llm: {
        configured: Boolean(readLlmEnv(env).apiKey),
        via: "X-Source: llm header or ?source=llm (EventSource / JSONP / iframe / WS)",
        appliesTo: ["once", "stream", "sse", "jsonp", "iframe-stream", "ws"],
        staysMock: ["long-poll", "beacon", "pixel", "h2-push", "capabilities"],
      },
    });
  });

  // Educational endpoint: Link preload (not H2 push) — what you should use instead.
  router.get("/h2-push", (_req, res) => {
    res.setHeader(
      "Link",
      "</api/demo/compare/pixel>; rel=preload; as=image",
    );
    res.json({
      ok: true,
      push: false,
      message:
        "This response uses Link: rel=preload (hint), NOT HTTP/2 PUSH_PROMISE. Browsers no longer accept H2 Server Push.",
      refs: [
        "https://developer.chrome.com/blog/deps-rems-106",
        "https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API",
      ],
    });
  });

  return router;
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

/**
 * Minimal RFC 6455 WebSocket frame encoder (text frames only).
 */
function encodeWsFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + opcode text
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/**
 * Decode a single masked client frame. Returns { opcode, payload } or null if incomplete.
 */
function decodeWsFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    payloadLen = Number(big);
    offset = 10;
  }

  if (masked) {
    if (buf.length < offset + 4) return null;
  }
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buf.length < offset + payloadLen) return null;

  let data = buf.subarray(offset, offset + payloadLen);
  if (masked) {
    const mask = buf.subarray(maskOffset, maskOffset + 4);
    data = Buffer.from(data);
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
  }

  return { opcode, payload: data.toString("utf8"), consumed: offset + payloadLen };
}

/**
 * Handle an HTTP Upgrade request for WebSocket on /api/demo/compare/ws.
 * Call this from the http.Server "upgrade" event.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("net").Socket} socket
 * @param {Buffer} head
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, maxRequests?: number, windowMs?: number }} [options]
 */
export function handleWsUpgrade(req, socket, head, options = {}) {
  const { env = process.env, fetchImpl = globalThis.fetch } = options;

  let pathname = req.url || "";
  let source = "";
  try {
    const u = new URL(req.url || "/", "http://localhost");
    pathname = u.pathname;
    source = u.searchParams.get("source") || "";
  } catch {
    pathname = String(req.url || "").split("?")[0];
  }

  if (pathname !== "/api/demo/compare/ws") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  // RFC 6455 handshake
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n",
  );

  let buf = head && head.length ? head : Buffer.alloc(0);
  const useLlm = source.trim().toLowerCase() === "llm";
  let streaming = false;

  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const frame = decodeWsFrame(buf);
      if (!frame) break;
      buf = buf.slice(frame.consumed);
      if (frame.opcode === 0x8) {
        socket.write(Buffer.from([0x88, 0x00]));
        socket.destroy();
        return;
      }
      if ((frame.opcode === 0x1 || frame.opcode === 0x0) && !streaming) {
        streaming = true;
        if (useLlm) {
          streamLlmToSocket(socket, { env, fetchImpl, req });
        } else {
          streamWordsToSocket(socket);
        }
      }
    }
  });

  socket.on("error", () => socket.destroy());
}

async function streamWordsToSocket(socket) {
  const delay = DEFAULT_DELAY;
  for (const word of MOCK_WORDS) {
    if (socket.destroyed) return;
    socket.write(encodeWsFrame(word));
    await sleep(delay);
  }
  if (!socket.destroyed) {
    socket.write(Buffer.from([0x88, 0x00]));
    socket.end();
  }
}

async function streamLlmToSocket(socket, { env, fetchImpl, req }) {
  const ip = req.socket?.remoteAddress || "unknown";
  if (!wsLlmLimiter(`compare-llm-ws:${ip}`)) {
    if (!socket.destroyed) {
      socket.write(encodeWsFrame("[error] rate_limited"));
      socket.write(Buffer.from([0x88, 0x00]));
      socket.end();
    }
    return;
  }

  const controller = new AbortController();
  socket.on("close", () => controller.abort());

  try {
    const upstream = await openCompareLlmStream({
      env,
      fetchImpl,
      signal: controller.signal,
    });
    for await (const token of iterateSseTextTokens(upstream.body)) {
      if (socket.destroyed) return;
      socket.write(encodeWsFrame(token));
      await sleep(DEFAULT_DELAY);
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    const msg =
      error?.code === "llm_not_configured"
        ? "[error] llm_not_configured"
        : "[error] llm_request_failed";
    if (!socket.destroyed) socket.write(encodeWsFrame(msg));
  }

  if (!socket.destroyed) {
    socket.write(Buffer.from([0x88, 0x00]));
    socket.end();
  }
}
