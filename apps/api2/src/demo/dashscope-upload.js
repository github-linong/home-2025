/**
 * Upload local / data-URL media to DashScope temporary OSS storage.
 * Video and audio inputs must be oss:// or public http(s) URLs — raw data:video/audio
 * URLs cause DashScope InternalError.Algo (stat: path ... NoneType).
 *
 * @see https://help.aliyun.com/en/model-studio/get-temporary-file-url
 */

const UPLOADS_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/uploads";

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

export function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  const meta = dataUrl.slice(5, comma);
  const base64 = dataUrl.slice(comma + 1);
  const semi = meta.indexOf(";");
  const mime = (semi === -1 ? meta : meta.slice(0, semi)).trim().toLowerCase();
  if (!mime || !base64) return null;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  const ext = MIME_EXT[mime] || mime.split("/")[1] || "bin";
  return { mime, buffer, ext };
}

export function mediaNeedsOssUpload(url) {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("oss://")) return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return false;
  if (!url.startsWith("data:")) return false;
  const parsed = parseDataUrl(url);
  if (!parsed) return true;
  return parsed.mime.startsWith("video/") || parsed.mime.startsWith("audio/");
}

async function getUploadPolicy(apiKey, modelName, fetchImpl) {
  const url = new URL(UPLOADS_ENDPOINT);
  url.searchParams.set("action", "getPolicy");
  url.searchParams.set("model", modelName);
  const res = await fetchImpl(url.href, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`DashScope upload policy HTTP ${res.status}: ${detail}`);
  }
  const payload = await res.json();
  const data = payload?.data ?? payload?.output ?? payload;
  if (!data?.upload_host || !data?.upload_dir) {
    throw new Error("DashScope upload policy response missing upload_host");
  }
  return data;
}

async function uploadBuffer(policy, buffer, filename, mime, fetchImpl) {
  const key = `${policy.upload_dir}/${filename}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", policy.oss_access_key_id);
  form.append("Signature", policy.signature);
  form.append("policy", policy.policy);
  form.append("x-oss-object-acl", policy.x_oss_object_acl);
  form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
  form.append("key", key);
  form.append("success_action_status", "200");
  if (mime) form.append("x-oss-content-type", mime);
  form.append("file", new Blob([buffer], { type: mime || "application/octet-stream" }), filename);

  const res = await fetchImpl(policy.upload_host, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`DashScope OSS upload HTTP ${res.status}: ${detail}`);
  }
  return `oss://${key}`;
}

/**
 * Resolve a media URL for video-generation APIs.
 * Returns { url, usedOss: boolean }.
 */
export async function resolveMediaUrl(url, { apiKey, modelId, fetchImpl = globalThis.fetch, cache }) {
  if (!url || typeof url !== "string") return { url: null, usedOss: false };
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { url, usedOss: false };
  }
  if (url.startsWith("oss://")) {
    return { url, usedOss: true };
  }
  if (!url.startsWith("data:")) {
    throw new Error(`Unsupported media URL scheme: ${url.slice(0, 32)}…`);
  }

  const cacheKey = `${modelId}:${url.length}:${url.slice(0, 64)}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const parsed = parseDataUrl(url);
  if (!parsed) throw new Error("Invalid data URL for media upload");

  const mustUpload =
    parsed.mime.startsWith("video/") ||
    parsed.mime.startsWith("audio/") ||
    parsed.buffer.length > 8 * 1024 * 1024;

  if (!mustUpload) {
    const out = { url, usedOss: false };
    cache?.set(cacheKey, out);
    return out;
  }

  const policy = await getUploadPolicy(apiKey, modelId, fetchImpl);
  const filename = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${parsed.ext}`;
  const ossUrl = await uploadBuffer(policy, parsed.buffer, filename, parsed.mime, fetchImpl);
  const out = { url: ossUrl, usedOss: true };
  cache?.set(cacheKey, out);
  return out;
}

export async function resolveMediaFields(fields, ctx) {
  const cache = new Map();
  let usedOss = false;
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const arr = [];
      for (const item of value) {
        const resolved = await resolveMediaUrl(item, { ...ctx, cache });
        if (resolved.usedOss) usedOss = true;
        arr.push(resolved.url);
      }
      out[key] = arr;
      continue;
    }
    const resolved = await resolveMediaUrl(value, { ...ctx, cache });
    if (resolved.usedOss) usedOss = true;
    out[key] = resolved.url;
  }
  return { fields: out, usedOss };
}

/**
 * Validate required media before calling DashScope (return user-facing message or null).
 */
export function validateVideoMedia(modelCfg, params) {
  if (modelCfg.type === "i2v" && !params.imgUrl) {
    return "图生视频需要上传首帧参考图";
  }
  if (modelCfg.type === "videoedit") {
    if (!params.videoUrl) return "视频编辑需要上传待编辑视频";
    if (!params.refImages?.length && !params.videoUrl) {
      return "视频编辑需要上传待编辑视频";
    }
  }
  if (modelCfg.type === "r2v") {
    const hasRef = (params.refImages?.length ?? 0) > 0 || params.refVideoUrl;
    if (!hasRef) return "参考生视频需要至少一张参考图或一个参考视频";
  }
  if (modelCfg.mediaStyle === "media" && modelCfg.type === "i2v") {
    if ((params.lastFrameUrl || params.drivingAudioUrl) && !params.imgUrl) {
      return "使用尾帧或驱动音频时，必须先上传首帧参考图";
    }
  }
  return null;
}
