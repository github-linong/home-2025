import { Router } from "express";
import lingmouPkg from "@alicloud/lingmou20250527";
import openapiCore from "@alicloud/openapi-core";

const LingmouClient = lingmouPkg.default;
const { CreateChatSessionRequest, CloseChatInstanceSessionsRequest } = lingmouPkg;
const { Config } = openapiCore.$OpenApiUtil;

const REQUIRED_ENV = [
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "LINGMOU_CHAT_PROJECT_ID",
  "LINGMOU_INSTANCE_ID",
];

/** Collect LingMou config from env; returns { missing } when incomplete. */
export function readAvatarEnv(env = process.env) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) return { missing };
  return {
    missing: [],
    accessKeyId: env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint: env.LINGMOU_ENDPOINT || "lingmou.cn-beijing.aliyuncs.com",
    projectId: env.LINGMOU_CHAT_PROJECT_ID,
    instanceId: env.LINGMOU_INSTANCE_ID,
    license: env.LINGMOU_SDK_LICENSE || "",
    platform: env.LINGMOU_PLATFORM || "Web",
  };
}

/** Shape the OpenAPI response body into what the web SDK needs. */
export function buildSessionPayload(body, cfg = {}) {
  const data = body?.data ?? {};
  return {
    ok: true,
    sessionId: data.sessionId ?? null,
    rtcParams: data.rtcParams ?? null,
    // Present only for client-side ("端渲染") avatars.
    avatarAssets: data.avatarAssets ?? null,
    // The web SDK needs the same license to decrypt client-side assets.
    license: data.avatarAssets ? cfg.license || null : null,
    requestId: body?.requestId ?? null,
  };
}

function defaultCreateClient(cfg) {
  return new LingmouClient(
    new Config({
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      endpoint: cfg.endpoint,
    }),
  );
}

/**
 * Avatar chat demo routes. Mounted at /api/demo/avatar
 * `createClient` is injectable for tests.
 */
export function createAvatarRouter({ createClient = defaultCreateClient, env = process.env } = {}) {
  const router = Router();
  let client = null;

  router.post("/session", async (req, res) => {
    const cfg = readAvatarEnv(env);
    if (cfg.missing.length > 0) {
      res.status(503).json({
        ok: false,
        error: "missing_env",
        message: `Missing env vars: ${cfg.missing.join(", ")}`,
      });
      return;
    }

    try {
      if (!client) client = createClient(cfg);
      const request = new CreateChatSessionRequest({
        instanceId: cfg.instanceId,
        // license/platform are only required for client-side rendering.
        ...(cfg.license ? { license: cfg.license, platform: cfg.platform } : {}),
      });
      const resp = await client.createChatSession(cfg.projectId, request);
      const body = resp?.body;
      if (!body?.success && body?.code && String(body.code) !== "200") {
        res.status(502).json({
          ok: false,
          error: "lingmou_error",
          code: body.code,
          message: body.message || "CreateChatSession failed",
          requestId: body.requestId ?? null,
        });
        return;
      }
      res.set("Cache-Control", "no-store");
      res.json(buildSessionPayload(body, cfg));
    } catch (err) {
      console.error("[api2] avatar session failed:", err);
      res.status(502).json({
        ok: false,
        error: "lingmou_request_failed",
        message: err?.message || "unknown error",
        // Aliyun SDK attaches a diagnostic URL under err.data.Recommend.
        recommend: err?.data?.Recommend ?? null,
      });
    }
  });

  router.post("/session/close", async (req, res) => {
    const cfg = readAvatarEnv(env);
    if (cfg.missing.length > 0) {
      res.status(503).json({ ok: false, error: "missing_env" });
      return;
    }
    const sessionId = req.body?.sessionId;
    if (!sessionId) {
      res.status(400).json({ ok: false, error: "missing_session_id" });
      return;
    }
    try {
      if (!client) client = createClient(cfg);
      const resp = await client.closeChatInstanceSessions(
        cfg.instanceId,
        new CloseChatInstanceSessionsRequest({ sessionIds: [sessionId] }),
      );
      res.json({ ok: true, requestId: resp?.body?.requestId ?? null });
    } catch (err) {
      console.error("[api2] avatar session close failed:", err);
      res.status(502).json({
        ok: false,
        error: "lingmou_request_failed",
        message: err?.message || "unknown error",
      });
    }
  });

  return router;
}
