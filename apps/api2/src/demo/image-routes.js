import { Router } from "express";

const TASK_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/tasks";
const MAX_PROMPT_LENGTH = 2000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 300_000; // 5 minutes

/* ------------------------------------------------------------------ */
/*  Model registry — each model declares its endpoint + capabilities  */
/* ------------------------------------------------------------------ */

const ENDPOINT_T2I =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis";
const ENDPOINT_IMG_GEN =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation";
const ENDPOINT_MULTIMODAL =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

const MODELS = {
  "wan2.7-image-pro": {
    endpoint: ENDPOINT_IMG_GEN,
    async: true,
    label: "Wan 2.7 Image Pro",
    maxRefImages: 4,
    thinking: true,
    sizes: ["1024*1024", "2048*2048", "4096*4096"],
  },
  "qwen-image-2.0": {
    endpoint: ENDPOINT_MULTIMODAL,
    async: false,
    label: "Qwen Image 2.0",
    maxRefImages: 10,
    sizes: ["1024*1024", "720*1280", "1280*720", "2048*2048"],
  },
  "z-image-turbo": {
    endpoint: ENDPOINT_MULTIMODAL,
    async: false,
    label: "Z-Image Turbo",
    promptExtend: true,
    sizes: ["1024*1024", "720*1280", "1280*720", "2048*2048"],
  },
  "wanx2.1-t2i-turbo": {
    endpoint: ENDPOINT_T2I,
    async: true,
    label: "Wanx 2.1 Turbo",
    promptExtend: true,
    sizes: ["1024*1024", "720*1280", "1280*720", "768*1152", "1152*768"],
  },
  "wanx-v1": {
    endpoint: ENDPOINT_T2I,
    async: true,
    label: "Wanx V1",
    maxRefImages: 1,
    styles: [
      "<auto>",
      "<photography>",
      "<portrait>",
      "<3d cartoon>",
      "<anime>",
      "<oil painting>",
      "<watercolor>",
      "<sketch>",
      "<chinese painting>",
      "<flat>",
    ],
    sizes: ["1024*1024", "720*1280", "1280*720"],
  },
};

const ALLOWED_MODELS = Object.keys(MODELS);

export function readImageEnv(env = process.env) {
  return {
    apiKey: env.DASHSCOPE_API_KEY || "",
    workspaceId: env.DASHSCOPE_WORKSPACE_ID || "",
    defaultModel: env.DASHSCOPE_IMAGE_MODEL || "wanx2.1-t2i-turbo",
  };
}

export function normalizeImageUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!url.hostname.endsWith(".aliyuncs.com")) return null;
    url.protocol = "https:";
    return url.href;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function createRateLimiter({ maxRequests = 15, windowMs = 60_000 } = {}) {
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

async function pollTask(taskId, { fetchImpl, apiKey, workspaceId }) {
  const start = Date.now();
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (workspaceId) headers["X-DashScope-WorkSpace"] = workspaceId;

  while (Date.now() - start < MAX_POLL_MS) {
    const res = await fetchImpl(`${TASK_ENDPOINT}/${taskId}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      throw new Error(`Task poll HTTP ${res.status}: ${detail}`);
    }
    const body = await res.json();
    const status = body?.output?.task_status;
    if (status === "SUCCEEDED") return body;
    if (status === "FAILED") {
      const msg = body?.output?.message || "Unknown error";
      const code = body?.output?.code || "";
      throw new Error(`Task failed: ${code ? `[${code}] ` : ""}${msg}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Task ${taskId} timed out after ${MAX_POLL_MS / 1000}s`);
}

/** Extract image URL from any DashScope image output format. */
function extractImageUrl(output) {
  // V1/V2 text2image format: output.results[].url
  const results = output?.results;
  if (Array.isArray(results)) {
    for (const item of results) {
      if (typeof item?.url === "string") return item.url;
    }
  }
  // Multimodal / GenEdit format: output.choices[].message.content[].image
  const content = output?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item?.image === "string") return item.image;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Request builders per model family                                 */
/* ------------------------------------------------------------------ */

function buildText2ImageBody(model, prompt, params) {
  const body = {
    model,
    input: { prompt },
    parameters: { size: params.size },
  };
  if (params.negativePrompt) body.input.negative_prompt = params.negativePrompt;
  if (params.seed != null) body.parameters.seed = params.seed;
  if (params.promptExtend != null) body.parameters.prompt_extend = params.promptExtend;
  if (params.n) body.parameters.n = params.n;
  // wanx-v1 specifics
  if (params.style) body.parameters.style = params.style;
  if (params.refImages?.length) body.input.ref_img = params.refImages[0];
  if (params.refMode) body.parameters.ref_mode = params.refMode;
  if (params.refStrength != null) body.parameters.ref_strength = params.refStrength;
  return body;
}

function buildGenEditBody(model, prompt, params) {
  // The image-generation endpoint uses the multimodal messages format.
  // Reference images go in input.reference_images, NOT mixed into content.
  const body = {
    model,
    input: {
      messages: [{ role: "user", content: [{ text: prompt }] }],
    },
    parameters: { size: params.size },
  };
  if (params.refImages?.length) body.input.reference_images = params.refImages;
  if (params.negativePrompt) body.parameters.negative_prompt = params.negativePrompt;
  if (params.seed != null) body.parameters.seed = params.seed;
  if (params.n) body.parameters.n = params.n;
  if (params.thinking) body.parameters.thinking_mode = true;
  return body;
}

function buildMultimodalBody(model, prompt, params) {
  // For the multimodal-generation endpoint, reference images go in
  // input.image_urls (separate from the text prompt in content).
  const body = {
    model,
    input: {
      messages: [{ role: "user", content: [{ text: prompt }] }],
    },
    parameters: { size: params.size },
  };
  if (params.refImages?.length) body.input.image_urls = params.refImages;
  if (params.negativePrompt) body.parameters.negative_prompt = params.negativePrompt;
  if (params.seed != null) body.parameters.seed = params.seed;
  if (params.promptExtend != null) body.parameters.prompt_extend = params.promptExtend;
  if (params.n) body.parameters.n = params.n;
  return body;
}

/* ------------------------------------------------------------------ */
/*  GET /models — return model capabilities for the frontend          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

export function createImageRouter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  maxRequests = 15,
  windowMs = 60_000,
} = {}) {
  const router = Router();
  const allowRequest = createRateLimiter({ maxRequests, windowMs });

  // Return model metadata so the frontend can build its UI dynamically.
  router.get("/models", (_req, res) => {
    const cfg = readImageEnv(env);
    const list = ALLOWED_MODELS.map((id) => ({
      id,
      ...MODELS[id],
      default: id === cfg.defaultModel,
    }));
    res.json({ ok: true, models: list });
  });

  router.post("/", async (req, res) => {
    const cfg = readImageEnv(env);
    if (!cfg.apiKey) {
      res.status(503).json({
        ok: false,
        error: "image_not_configured",
        message: "DASHSCOPE_API_KEY is not configured",
      });
      return;
    }

    /* ---- validate inputs ---- */
    const prompt =
      typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({
        ok: false,
        error: "invalid_prompt",
        message: `prompt must contain 1-${MAX_PROMPT_LENGTH} characters`,
      });
      return;
    }

    const modelId =
      typeof req.body?.model === "string" && ALLOWED_MODELS.includes(req.body.model)
        ? req.body.model
        : cfg.defaultModel;
    const modelCfg = MODELS[modelId];

    const size =
      typeof req.body?.size === "string" && modelCfg.sizes.includes(req.body.size)
        ? req.body.size
        : modelCfg.sizes[0];

    const negativePrompt =
      typeof req.body?.negative_prompt === "string"
        ? req.body.negative_prompt.trim().slice(0, 500)
        : "";

    // Optional numeric / boolean params
    const seed =
      typeof req.body?.seed === "number" && Number.isInteger(req.body.seed)
        ? req.body.seed
        : null;
    const n =
      typeof req.body?.n === "number" && req.body.n >= 1 && req.body.n <= 4
        ? Math.floor(req.body.n)
        : null;
    const promptExtend =
      typeof req.body?.prompt_extend === "boolean" ? req.body.prompt_extend : null;
    const thinking =
      modelCfg.thinking && req.body?.thinking_mode === true;

    // Style (wanx-v1 only)
    const style =
      modelCfg.styles && typeof req.body?.style === "string" && modelCfg.styles.includes(req.body.style)
        ? req.body.style
        : null;

    // Reference images (data URIs or URLs)
    let refImages = [];
    if (modelCfg.maxRefImages && Array.isArray(req.body?.ref_images)) {
      refImages = req.body.ref_images
        .filter((u) => typeof u === "string" && (u.startsWith("http") || u.startsWith("data:")))
        .slice(0, modelCfg.maxRefImages);
    }

    // Ref mode/strength (wanx-v1)
    const refMode =
      modelCfg.styles && (req.body?.ref_mode === "repaint" || req.body?.ref_mode === "refonly")
        ? req.body.ref_mode
        : null;
    const refStrength =
      modelCfg.styles && typeof req.body?.ref_strength === "number"
        ? Math.max(0, Math.min(1, req.body.ref_strength))
        : null;

    /* ---- rate limit ---- */
    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowRequest(clientKey)) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const t0 = Date.now();
    const tag = `[img:${clientKey}]`;
    console.log(`${tag} ▶ model=${modelId} size=${size} prompt="${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""}" refs=${refImages.length}`);

    try {
      /* ---- build request body ---- */
      const params = {
        size,
        negativePrompt,
        seed,
        n,
        promptExtend,
        thinking,
        refImages,
        style,
        refMode,
        refStrength,
      };

      let body;
      if (modelCfg.endpoint === ENDPOINT_MULTIMODAL) {
        body = buildMultimodalBody(modelId, prompt, params);
      } else if (modelCfg.endpoint === ENDPOINT_IMG_GEN) {
        body = buildGenEditBody(modelId, prompt, params);
      } else {
        body = buildText2ImageBody(modelId, prompt, params);
      }

      /* ---- submit ---- */
      const headers = {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      };
      if (cfg.workspaceId) headers["X-DashScope-WorkSpace"] = cfg.workspaceId;

      const timeoutMs = modelCfg.async ? 60_000 : 180_000; // sync needs more time
      if (modelCfg.async) headers["X-DashScope-Async"] = "enable";

      const tSubmit = Date.now();
      const submitResponse = await fetchImpl(modelCfg.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!submitResponse.ok) {
        const detail = (await submitResponse.text()).slice(0, 500);
        throw new Error(`DashScope HTTP ${submitResponse.status}: ${detail}`);
      }

      const submitPayload = await submitResponse.json();
      console.log(`${tag} ✓ submitted in ${Date.now() - tSubmit}ms`);

      /* ---- resolve image URL ---- */
      let imageUrl = null;

      if (modelCfg.async) {
        const taskId = submitPayload?.output?.task_id;
        const taskStatus = submitPayload?.output?.task_status;
        if (taskId && taskStatus !== "SUCCEEDED") {
          console.log(`${tag} ⏳ polling task ${taskId} (${taskStatus})`);
          const tPoll = Date.now();
          const result = await pollTask(taskId, {
            fetchImpl,
            apiKey: cfg.apiKey,
            workspaceId: cfg.workspaceId,
            tag,
          });
          console.log(`${tag} ✓ task done in ${Date.now() - tPoll}ms`);
          imageUrl = extractImageUrl(result?.output);
        } else {
          imageUrl = extractImageUrl(submitPayload?.output);
        }
      } else {
        console.log(`${tag} ✓ sync response in ${Date.now() - tSubmit}ms`);
        imageUrl = extractImageUrl(submitPayload?.output);
      }

      const normalizedUrl = normalizeImageUrl(imageUrl || "");
      if (!normalizedUrl) {
        throw new Error("DashScope returned an invalid image URL");
      }

      /* ---- proxy image bytes ---- */
      const tDownload = Date.now();
      const imageResponse = await fetchImpl(normalizedUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
      if (!imageResponse.ok) {
        throw new Error(`Image download HTTP ${imageResponse.status}`);
      }

      const contentLength = Number(imageResponse.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw new Error("Generated image exceeds size limit");
      }

      const image = Buffer.from(await imageResponse.arrayBuffer());
      if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
        throw new Error("Generated image has an invalid size");
      }

      const totalMs = Date.now() - t0;
      console.log(`${tag} ✓ downloaded ${(image.length / 1024).toFixed(0)}KB in ${Date.now() - tDownload}ms | total ${totalMs}ms`);

      res.set({
        "Content-Type": "image/png",
        "Content-Length": String(image.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Gen-Model": modelId,
        "X-Gen-Total-Ms": String(totalMs),
        "X-Gen-Submit-Ms": String(Date.now() - tSubmit),
        "X-Gen-Download-Ms": String(Date.now() - tDownload),
        "X-Gen-Image-KB": String(Math.round(image.length / 1024)),
      });
      res.send(image);
    } catch (error) {
      console.error("[api2] Image generation failed:", error);
      res.status(502).json({
        ok: false,
        error: "image_request_failed",
        message: error.message || "Image generation failed",
      });
    }
  });

  return router;
}
