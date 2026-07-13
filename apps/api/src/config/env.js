"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../../.env") });
require("dotenv").config();

const rootDir = path.resolve(__dirname, "../..");

const config = {
  port: Number(process.env.API_PORT || 3001),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "https://www.lilnong.top").replace(
    /\/$/,
    ""
  ),
  wxHostAllowlist: (process.env.WX_HOST_ALLOWLIST || "www.lilnong.top")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  paths: {
    root: rootDir,
    assets: path.join(rootDir, "assets"),
    uploads: process.env.UPLOAD_DIR || path.join(rootDir, "data/uploads"),
    fontmin: process.env.FONTMIN_DIR || path.join(rootDir, "data/fontmin"),
    fontSource: path.join(rootDir, "assets/fonts/font.ttf"),
    logs: process.env.LOG_DIR || path.join(rootDir, "data/logs"),
    felog: process.env.FELOG_DIR || path.join(rootDir, "data/felog"),
    invitationClient: path.join(
      rootDir,
      "assets/github_invitation/invitation/client"
    ),
    mergeTemplate: path.join(rootDir, "assets/merge_template_base64.txt"),
    decrypt: path.join(rootDir, "vendor/decrypt"),
  },

  baidu: {
    clientId: process.env.BAIDU_CLIENT_ID || "",
    clientSecret: process.env.BAIDU_CLIENT_SECRET || "",
  },
  facepp: {
    apiKey: process.env.FACEPP_API_KEY || "",
    apiSecret: process.env.FACEPP_API_SECRET || "",
  },
  tencent: {
    secretId: process.env.TENCENT_SECRET_ID || "",
    secretKey: process.env.TENCENT_SECRET_KEY || "",
    region: process.env.TENCENT_REGION || "ap-beijing",
    projectId: process.env.TENCENT_FACEFUSION_PROJECT_ID || "303154",
    defaultModelId:
      process.env.TENCENT_FACEFUSION_DEFAULT_MODEL_ID || "qc_303154_598422_14",
  },
  wechat: {
    appId: process.env.WX_APPID || "",
    appSecret: process.env.WX_APP_SECRET || "",
    serverToken: process.env.WX_SERVER_TOKEN || "invitationln",
  },
  mongo: {
    uri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/",
  },
  music: {
    kgCookie: process.env.KG_QQ_COOKIE || "",
    kgCookieAlt: process.env.KG_QQ_COOKIE_ALT || "",
    neteaseApiBase: process.env.NETEASE_API_BASE || "http://127.0.0.1:9101",
  },
  oss: {
    enabled:
      String(process.env.OSS_ENABLED || "").toLowerCase() === "true" ||
      Boolean(process.env.OSS_ACCESS_KEY_ID && process.env.OSS_ACCESS_KEY_SECRET),
    region: process.env.OSS_REGION || "oss-cn-beijing",
    bucket: process.env.OSS_BUCKET || "hone-2023",
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
    // Private prefix (outside public-read static/*). Not served via nginx.
    prefix: (process.env.OSS_PREFIX || "private/uploads").replace(/^\/+|\/+$/g, ""),
    // Keep false until you intentionally open public download URLs.
    publicRead:
      String(process.env.OSS_PUBLIC_READ || "").toLowerCase() === "true",
    // Only used when publicRead is true (e.g. via nginx /static/ later).
    publicBase: (process.env.OSS_PUBLIC_BASE || "").replace(/\/$/, ""),
  },
};

module.exports = config;
