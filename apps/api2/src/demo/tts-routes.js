import { Router } from "express";

const DEFAULT_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer";
const MAX_TEXT_LENGTH = 800;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export function readTtsEnv(env = process.env) {
  return {
    apiKey: env.DASHSCOPE_API_KEY || "",
    endpoint: env.DASHSCOPE_TTS_ENDPOINT || DEFAULT_ENDPOINT,
    workspaceId: env.DASHSCOPE_WORKSPACE_ID || "",
    model: env.DASHSCOPE_TTS_MODEL || "cosyvoice-v3-flash",
    voice: env.DASHSCOPE_TTS_VOICE || "longanhuan",
  };
}

export function normalizeAudioUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!url.hostname.endsWith(".aliyuncs.com")) return null;
    // Some documented responses still contain an http URL; always upgrade it.
    url.protocol = "https:";
    return url.href;
  } catch {
    return null;
  }
}

export function isAllowedAudioUrl(value) {
  return Boolean(normalizeAudioUrl(value));
}

function createRateLimiter({ maxRequests = 10, windowMs = 60_000 } = {}) {
  const clients = new Map();
  return (key) => {
    if (maxRequests <= 0) return false;
    const now = Date.now();
    const current = clients.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      clients.set(key, { count: 1, startedAt: now });
      return true;
    }
    current.count += 1;
    return current.count <= maxRequests;
  };
}

/**
 * Server-side CosyVoice proxy. Keeping both DashScope calls here prevents API
 * keys from reaching the browser and prevents arbitrary URL fetching.
 */
export function createTtsRouter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  maxRequests = 10,
  windowMs = 60_000,
} = {}) {
  const router = Router();
  const allowRequest = createRateLimiter({ maxRequests, windowMs });

  router.post("/", async (req, res) => {
    const cfg = readTtsEnv(env);
    if (!cfg.apiKey) {
      res.status(503).json({
        ok: false,
        error: "tts_not_configured",
        message: "DASHSCOPE_API_KEY is not configured",
      });
      return;
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > MAX_TEXT_LENGTH) {
      res.status(400).json({
        ok: false,
        error: "invalid_text",
        message: `text must contain 1-${MAX_TEXT_LENGTH} characters`,
      });
      return;
    }

    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowRequest(clientKey)) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    try {
      const headers = {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      };
      if (cfg.workspaceId) headers["X-DashScope-WorkSpace"] = cfg.workspaceId;

      const synthesisResponse = await fetchImpl(cfg.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          input: {
            text,
            voice: cfg.voice,
            format: "wav",
            sample_rate: 24000,
            language_hints: ["zh"],
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!synthesisResponse.ok) {
        const detail = (await synthesisResponse.text()).slice(0, 500);
        throw new Error(`DashScope HTTP ${synthesisResponse.status}: ${detail}`);
      }

      const payload = await synthesisResponse.json();
      const audioUrl = normalizeAudioUrl(payload?.output?.audio?.url);
      if (!audioUrl) {
        throw new Error("DashScope returned an invalid audio URL");
      }

      const audioResponse = await fetchImpl(audioUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!audioResponse.ok) {
        throw new Error(`Audio download HTTP ${audioResponse.status}`);
      }

      const contentLength = Number(audioResponse.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES) {
        throw new Error("Generated audio exceeds size limit");
      }
      const audio = Buffer.from(await audioResponse.arrayBuffer());
      if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
        throw new Error("Generated audio has an invalid size");
      }

      res.set({
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.send(audio);
    } catch (error) {
      console.error("[api2] CosyVoice synthesis failed:", error);
      res.status(502).json({
        ok: false,
        error: "tts_request_failed",
        message: "CosyVoice synthesis failed",
      });
    }
  });

  return router;
}
