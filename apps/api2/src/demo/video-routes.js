import { Router } from "express";
import { resolveMediaFields, validateVideoMedia } from "./dashscope-upload.js";

const VIDEO_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis";
const TASK_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/tasks";
const MAX_PROMPT_LENGTH = 2000;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_MS = 600_000; // 10 minutes

/* ------------------------------------------------------------------ */
/*  Model registry                                                    */
/* ------------------------------------------------------------------ */

const MODELS = {
  "happyhorse-1.1-t2v": {
    label: "HappyHorse 1.1",
    type: "t2v",
    paramStyle: "resolution",
    resolutions: ["480P", "720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"],
    minDuration: 3,
    maxDuration: 15,
    audio: true,
    watermark: true,
  },
  "wan2.7-t2v": {
    label: "Wan 2.7 T2V",
    type: "t2v",
    paramStyle: "resolution", // uses resolution + ratio
    resolutions: ["480P", "720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    minDuration: 2,
    maxDuration: 15,
    audio: true,
    watermark: true,
    promptExtend: true,
    supportsAudioUrl: true,  // 支持外部音轨
  },
  "wan2.6-t2v": {
    label: "Wan 2.6 T2V",
    type: "t2v",
    paramStyle: "size",
    sizes: ["1280*720", "720*1280", "960*960"],
    minDuration: 2,
    maxDuration: 15,
    audio: true,
  },
  "wanx2.1-t2v-turbo": {
    label: "Wanx 2.1 Turbo",
    type: "t2v",
    paramStyle: "size",
    sizes: ["1280*720", "720*1280", "960*960"],
    minDuration: 5,
    maxDuration: 5,
    audio: false,
  },
  "wanx2.1-t2v-plus": {
    label: "Wanx 2.1 Plus",
    type: "t2v",
    paramStyle: "size",
    sizes: ["1280*720", "720*1280", "960*960"],
    minDuration: 5,
    maxDuration: 5,
    audio: false,
  },
  "wan2.7-i2v": {
    label: "Wan 2.7 I2V",
    type: "i2v",
    paramStyle: "resolution",
    resolutions: ["720P", "1080P"],
    minDuration: 2,
    maxDuration: 15,
    maxRefImages: 1,
    audio: true,
    mediaStyle: "media",
    watermark: true,
    promptExtend: true,
    supportsLastFrame: true,
    supportsDrivingAudio: true,
  },
  "wan2.6-i2v": {
    label: "Wan 2.6 I2V",
    type: "i2v",
    paramStyle: "size",
    sizes: ["1280*720", "720*1280", "960*960"],
    minDuration: 2,
    maxDuration: 15,
    maxRefImages: 1,
    audio: true,
  },
  "wanx2.1-i2v-plus": {
    label: "Wanx 2.1 I2V",
    type: "i2v",
    paramStyle: "size",
    sizes: ["1280*720", "720*1280", "960*960"],
    minDuration: 5,
    maxDuration: 5,
    maxRefImages: 1,
    audio: false,
  },
  "wan2.7-videoedit": {
    label: "Wan 2.7 VideoEdit",
    type: "videoedit",
    paramStyle: "resolution",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    minDuration: 2,
    maxDuration: 10,
    audioSetting: true,
    watermark: true,
    promptExtend: true,
    maxRefImages: 4,
    requiresVideo: true,
  },
  "wan2.7-t2v-2026-06-12": {
    label: "Wan 2.7 T2V (0612)",
    type: "t2v",
    paramStyle: "resolution",
    resolutions: ["480P", "720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    minDuration: 2,
    maxDuration: 15,
    audio: true,
    watermark: true,
    promptExtend: true,
    supportsAudioUrl: true,
  },
  "happyhorse-1.1-i2v": {
    label: "HappyHorse 1.1 I2V",
    type: "i2v",
    paramStyle: "resolution",
    resolutions: ["480P", "720P", "1080P"],
    minDuration: 3,
    maxDuration: 15,
    maxRefImages: 1,
    mediaStyle: "media",
    watermark: true,
    watermarkDefault: true,
  },
  "happyhorse-1.1-r2v": {
    label: "HappyHorse 1.1 R2V",
    type: "r2v",
    paramStyle: "resolution",
    resolutions: ["480P", "720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"],
    minDuration: 3,
    maxDuration: 15,
    watermark: true,
    watermarkDefault: true,
    maxRefImages: 9,
    r2vMediaStyle: "images_only",
  },
  "wan2.7-r2v-2026-06-12": {
    label: "Wan 2.7 R2V (0612)",
    type: "r2v",
    paramStyle: "resolution",
    resolutions: ["720P", "1080P"],
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    minDuration: 2,
    maxDuration: 15,
    watermark: true,
    promptExtend: true,
    maxRefImages: 5,
    r2vMediaStyle: "full",
    supportsFirstFrame: true,
    supportsRefVideo: true,
    supportsRefVoice: true,
  },
};

const ALLOWED_MODELS = Object.keys(MODELS);

export function readVideoEnv(env = process.env) {
  return {
    apiKey: env.DASHSCOPE_API_KEY || "",
    workspaceId: env.DASHSCOPE_WORKSPACE_ID || "",
    defaultModel: env.DASHSCOPE_VIDEO_MODEL || "wanx2.1-t2v-turbo",
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function createRateLimiter({ maxRequests = 5, windowMs = 60_000 } = {}) {
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

function requestHadMedia(params) {
  return !!(
    params.imgUrl ||
    params.lastFrameUrl ||
    params.drivingAudioUrl ||
    params.audioUrl ||
    params.videoUrl ||
    params.refVideoUrl ||
    params.refVoiceUrl ||
    (params.refImages?.length ?? 0) > 0
  );
}

/** Map DashScope failures to user-facing messages (keep raw detail separate). */
export function formatVideoError(error, { hadMedia, modelId } = {}) {
  const detail = error?.message || "Video generation failed";
  if (/InternalError\.Algo/i.test(detail) && /NoneType/i.test(detail)) {
    if (hadMedia) {
      return {
        message:
          "媒体文件格式不被模型接受。请确认已上传首帧图/参考视频，或换用公网 URL。",
        detail,
      };
    }
    if (modelId === "wanx2.1-t2v-plus") {
      return {
        message:
          "DashScope 服务端处理失败（wanx2.1-t2v-plus 偶发）。建议改用「Wanx 2.1 Turbo」或「Wan 2.7 T2V」后重试。",
        detail,
      };
    }
    return {
      message: "DashScope 服务端处理失败，请稍后重试或更换模型。",
      detail,
    };
  }
  return { message: detail, detail: undefined };
}

function normalizeVideoUrl(value) {
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

async function pollVideoTask(taskId, { fetchImpl, apiKey, workspaceId, tag }) {
  const start = Date.now();
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (workspaceId) headers["X-DashScope-WorkSpace"] = workspaceId;

  while (Date.now() - start < MAX_POLL_MS) {
    const elapsed = Math.round((Date.now() - start) / 1000);
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

    console.log(`${tag} ⏳ ${status} (${elapsed}s elapsed)`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Task ${taskId} timed out after ${MAX_POLL_MS / 1000}s`);
}

/* ------------------------------------------------------------------ */
/*  Request body builders                                             */
/* ------------------------------------------------------------------ */

function buildVideoBody(model, modelCfg, prompt, params) {
  const input = { prompt };
  if (params.negativePrompt) input.negative_prompt = params.negativePrompt;

  // External audio URL (wan2.7-t2v)
  if (params.audioUrl) input.audio_url = params.audioUrl;

  // ---- Media input (4 formats) ----
  if (modelCfg.type === "videoedit") {
    // videoedit: media = [{type:"video", url}, {type:"reference_image", url}, ...]
    input.media = [];
    if (params.videoUrl) input.media.push({ type: "video", url: params.videoUrl });
    if (params.refImages?.length) {
      for (const url of params.refImages)
        input.media.push({ type: "reference_image", url });
    }
  } else if (modelCfg.type === "r2v") {
    // r2v: media = [{type:"reference_image", url}, {type:"reference_video", url}, {type:"first_frame", url}]
    input.media = [];
    if (params.refImages?.length) {
      for (const url of params.refImages)
        input.media.push({ type: "reference_image", url });
    }
    if (params.refVideoUrl) input.media.push({ type: "reference_video", url: params.refVideoUrl });
    if (params.imgUrl) input.media.push({ type: "first_frame", url: params.imgUrl });
    // reference_voice goes in the media item (wan2.7-r2v)
    if (params.refVoiceUrl && input.media.length > 0) {
      input.media[0].reference_voice = params.refVoiceUrl;
    }
  } else if (modelCfg.mediaStyle === "media") {
    // wan2.7-i2v / happyhorse-i2v: media = [{type:"first_frame", url}, ...]
    input.media = [];
    if (params.imgUrl) input.media.push({ type: "first_frame", url: params.imgUrl });
    if (params.lastFrameUrl) input.media.push({ type: "last_frame", url: params.lastFrameUrl });
    if (params.drivingAudioUrl) input.media.push({ type: "driving_audio", url: params.drivingAudioUrl });
  } else if (modelCfg.type === "i2v" && params.imgUrl) {
    // Legacy i2v (wan2.6-i2v, wanx2.1-i2v-plus): input.img_url
    input.img_url = params.imgUrl;
  }

  // ---- Parameters ----
  const parameters = {};

  if (modelCfg.paramStyle === "resolution") {
    parameters.resolution = params.resolution || "720P";
    if (modelCfg.ratios) parameters.ratio = params.ratio || "16:9";
  } else {
    parameters.size = params.size || "1280*720";
  }

  if (params.duration != null) parameters.duration = params.duration;
  if (params.seed != null) parameters.seed = params.seed;
  if (params.promptExtend != null) parameters.prompt_extend = params.promptExtend;
  if (params.watermark != null) parameters.watermark = params.watermark;
  if (params.audioSetting) parameters.audio_setting = params.audioSetting;

  return { model, input, parameters };
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

export function createVideoRouter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  maxRequests = 5,
  windowMs = 60_000,
} = {}) {
  const router = Router();
  const allowRequest = createRateLimiter({ maxRequests, windowMs });

  // Model metadata for the frontend
  router.get("/models", (_req, res) => {
    const cfg = readVideoEnv(env);
    const list = ALLOWED_MODELS.map((id) => ({
      id,
      ...MODELS[id],
      default: id === cfg.defaultModel,
    }));
    res.json({ ok: true, models: list });
  });

  router.post("/", async (req, res) => {
    const cfg = readVideoEnv(env);
    if (!cfg.apiKey) {
      res.status(503).json({
        ok: false,
        error: "video_not_configured",
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

    // Size / resolution params
    const size =
      modelCfg.paramStyle === "size" && typeof req.body?.size === "string" && (modelCfg.sizes || []).includes(req.body.size)
        ? req.body.size
        : null;
    const resolution =
      modelCfg.paramStyle === "resolution" && typeof req.body?.resolution === "string" && (modelCfg.resolutions || []).includes(req.body.resolution)
        ? req.body.resolution
        : null;
    const ratio =
      modelCfg.paramStyle === "resolution" && typeof req.body?.ratio === "string" && (modelCfg.ratios || []).includes(req.body.ratio)
        ? req.body.ratio
        : null;

    // Duration
    const duration =
      typeof req.body?.duration === "number" &&
      req.body.duration >= (modelCfg.minDuration || 5) &&
      req.body.duration <= (modelCfg.maxDuration || 5)
        ? Math.round(req.body.duration)
        : null;

    const negativePrompt =
      typeof req.body?.negative_prompt === "string"
        ? req.body.negative_prompt.trim().slice(0, 500)
        : "";

    const seed =
      typeof req.body?.seed === "number" && Number.isInteger(req.body.seed)
        ? req.body.seed
        : null;

    const promptExtend =
      typeof req.body?.prompt_extend === "boolean" ? req.body.prompt_extend : null;

    // Image URL for i2v models (first_frame for media-style, img_url for legacy)
    // Also used for r2v models as first_frame
    let imgUrl = null;
    if ((modelCfg.type === "i2v" || modelCfg.supportsFirstFrame) && typeof req.body?.img_url === "string") {
      if (req.body.img_url.startsWith("http") || req.body.img_url.startsWith("data:")) {
        imgUrl = req.body.img_url;
      }
    }

    // Reference video URL (r2v - wan2.7-r2v)
    let refVideoUrl = null;
    if (modelCfg.supportsRefVideo && typeof req.body?.ref_video_url === "string") {
      if (req.body.ref_video_url.startsWith("http") || req.body.ref_video_url.startsWith("data:")) {
        refVideoUrl = req.body.ref_video_url;
      }
    }

    // Reference voice URL (r2v - wan2.7-r2v)
    let refVoiceUrl = null;
    if (modelCfg.supportsRefVoice && typeof req.body?.ref_voice_url === "string") {
      if (req.body.ref_voice_url.startsWith("http") || req.body.ref_voice_url.startsWith("data:")) {
        refVoiceUrl = req.body.ref_voice_url;
      }
    }

    // Last frame URL (wan2.7-i2v)
    let lastFrameUrl = null;
    if (modelCfg.supportsLastFrame && typeof req.body?.last_frame_url === "string") {
      if (req.body.last_frame_url.startsWith("http") || req.body.last_frame_url.startsWith("data:")) {
        lastFrameUrl = req.body.last_frame_url;
      }
    }

    // Driving audio URL (wan2.7-i2v)
    let drivingAudioUrl = null;
    if (modelCfg.supportsDrivingAudio && typeof req.body?.driving_audio_url === "string") {
      if (req.body.driving_audio_url.startsWith("http") || req.body.driving_audio_url.startsWith("data:")) {
        drivingAudioUrl = req.body.driving_audio_url;
      }
    }

    // External audio URL for t2v models (wan2.7-t2v)
    let audioUrl = null;
    if (modelCfg.supportsAudioUrl && typeof req.body?.audio_url === "string") {
      if (req.body.audio_url.startsWith("http") || req.body.audio_url.startsWith("data:")) {
        audioUrl = req.body.audio_url;
      }
    }

    // Video URL for videoedit models (input video to edit)
    let inputVideoUrl = null;
    if (modelCfg.requiresVideo && typeof req.body?.video_url === "string") {
      if (req.body.video_url.startsWith("http") || req.body.video_url.startsWith("data:")) {
        inputVideoUrl = req.body.video_url;
      }
    }

    // Reference images for videoedit models (reference_image type)
    let refImages = [];
    if (modelCfg.maxRefImages && Array.isArray(req.body?.ref_images)) {
      refImages = req.body.ref_images
        .filter((u) => typeof u === "string" && (u.startsWith("http") || u.startsWith("data:")))
        .slice(0, modelCfg.maxRefImages);
    }

    // Watermark toggle
    const watermark =
      modelCfg.watermark && typeof req.body?.watermark === "boolean"
        ? req.body.watermark
        : null;

    // Audio setting (videoedit)
    const audioSetting =
      modelCfg.audioSetting && (req.body?.audio_setting === "auto" || req.body?.audio_setting === "origin")
        ? req.body.audio_setting
        : null;

    /* ---- validate required media ---- */
    const mediaError = validateVideoMedia(modelCfg, {
      imgUrl,
      videoUrl: inputVideoUrl,
      refImages,
      refVideoUrl,
      lastFrameUrl,
      drivingAudioUrl,
    });
    if (mediaError) {
      res.status(400).json({ ok: false, error: "invalid_media", message: mediaError });
      return;
    }

    /* ---- rate limit ---- */
    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowRequest(clientKey)) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const t0 = Date.now();
    const tag = `[vid:${clientKey}]`;
    const mediaFlags = [imgUrl ? "+img" : "", lastFrameUrl ? "+last" : "", drivingAudioUrl ? "+drvAudio" : "", audioUrl ? "+audio" : "", inputVideoUrl ? "+vid" : "", refVideoUrl ? "+refVid" : "", refVoiceUrl ? "+voice" : "", refImages.length ? `+ref${refImages.length}` : ""].filter(Boolean).join(" ");
    const hadMedia = requestHadMedia({
      imgUrl,
      lastFrameUrl,
      drivingAudioUrl,
      audioUrl,
      videoUrl: inputVideoUrl,
      refVideoUrl,
      refVoiceUrl,
      refImages,
    });
    console.log(`${tag} ▶ model=${modelId} ${modelCfg.paramStyle === "resolution" ? `${resolution}/${ratio}` : size} dur=${duration || "default"}s prompt="${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""}"${mediaFlags ? ` ${mediaFlags}` : ""}`);

    try {
      /* ---- resolve data: video/audio → oss:// (DashScope requirement) ---- */
      const resolved = await resolveMediaFields(
        {
          imgUrl,
          lastFrameUrl,
          drivingAudioUrl,
          audioUrl,
          videoUrl: inputVideoUrl,
          refVideoUrl,
          refVoiceUrl,
          refImages,
        },
        { apiKey: cfg.apiKey, modelId, fetchImpl },
      );
      imgUrl = resolved.fields.imgUrl;
      lastFrameUrl = resolved.fields.lastFrameUrl;
      drivingAudioUrl = resolved.fields.drivingAudioUrl;
      audioUrl = resolved.fields.audioUrl;
      inputVideoUrl = resolved.fields.videoUrl;
      refVideoUrl = resolved.fields.refVideoUrl;
      refVoiceUrl = resolved.fields.refVoiceUrl;
      refImages = resolved.fields.refImages ?? [];

      /* ---- build & submit ---- */
      const body = buildVideoBody(modelId, modelCfg, prompt, {
        size,
        resolution,
        ratio,
        duration,
        negativePrompt,
        seed,
        promptExtend,
        imgUrl,
        lastFrameUrl,
        drivingAudioUrl,
        audioUrl,
        videoUrl: inputVideoUrl,
        refVideoUrl,
        refVoiceUrl,
        refImages,
        watermark,
        audioSetting,
      });

      const headers = {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      };
      if (cfg.workspaceId) headers["X-DashScope-WorkSpace"] = cfg.workspaceId;
      if (resolved.usedOss) headers["X-DashScope-OssResourceResolve"] = "enable";

      const tSubmit = Date.now();
      const submitResponse = await fetchImpl(VIDEO_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (!submitResponse.ok) {
        const detail = (await submitResponse.text()).slice(0, 500);
        throw new Error(`DashScope HTTP ${submitResponse.status}: ${detail}`);
      }

      const submitPayload = await submitResponse.json();
      const taskId = submitPayload?.output?.task_id;
      const taskStatus = submitPayload?.output?.task_status;

      if (!taskId) {
        throw new Error("DashScope did not return a task_id");
      }

      console.log(`${tag} ✓ submitted in ${Date.now() - tSubmit}ms → ${taskId} (${taskStatus})`);

      /* ---- poll ---- */
      const tPoll = Date.now();
      const result = taskStatus === "SUCCEEDED"
        ? submitPayload
        : await pollVideoTask(taskId, {
            fetchImpl,
            apiKey: cfg.apiKey,
            workspaceId: cfg.workspaceId,
            tag,
          });

      console.log(`${tag} ✓ task done in ${Date.now() - tPoll}ms`);

      /* ---- extract video URL (handle multiple output formats) ---- */
      const rawVideoUrl =
        result?.output?.video_url ||
        result?.output?.results?.[0]?.url ||
        "";
      const videoUrl = normalizeVideoUrl(rawVideoUrl);
      if (!videoUrl) {
        throw new Error("DashScope returned an invalid video URL");
      }

      /* ---- proxy video bytes ---- */
      const tDownload = Date.now();
      console.log(`${tag} 📥 downloading video…`);

      const videoResponse = await fetchImpl(videoUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
      if (!videoResponse.ok) {
        throw new Error(`Video download HTTP ${videoResponse.status}`);
      }

      const contentLength = Number(videoResponse.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES) {
        throw new Error("Generated video exceeds size limit");
      }

      const video = Buffer.from(await videoResponse.arrayBuffer());
      if (video.length === 0 || video.length > MAX_VIDEO_BYTES) {
        throw new Error("Generated video has an invalid size");
      }

      const totalMs = Date.now() - t0;
      const videoMB = (video.length / 1024 / 1024).toFixed(1);
      console.log(`${tag} ✓ downloaded ${videoMB}MB in ${Date.now() - tDownload}ms | total ${(totalMs / 1000).toFixed(1)}s`);

      res.set({
        "Content-Type": "video/mp4",
        "Content-Length": String(video.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Gen-Model": modelId,
        "X-Gen-Total-Ms": String(totalMs),
        "X-Gen-Submit-Ms": String(Date.now() - tSubmit),
        "X-Gen-Poll-Ms": String(Date.now() - tPoll),
        "X-Gen-Download-Ms": String(Date.now() - tDownload),
        "X-Gen-Video-MB": videoMB,
      });
      res.send(video);
    } catch (error) {
      console.error(`${tag} ✗ failed:`, error.message);
      const formatted = formatVideoError(error, { hadMedia, modelId });
      res.status(502).json({
        ok: false,
        error: "video_request_failed",
        message: formatted.message,
        ...(formatted.detail ? { detail: formatted.detail } : {}),
      });
    }
  });

  return router;
}
