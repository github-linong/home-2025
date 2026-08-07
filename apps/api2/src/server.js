import express from "express";
import cors from "cors";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, pool } from "./auth.js";
import { createLearnRouter } from "./learn/routes.js";
import { createDemoRouter } from "./demo/stream-routes.js";
import { createSwaggerTsRouter } from "./demo/swagger-ts-routes.js";
import { createCompareRouter, handleWsUpgrade } from "./demo/compare-routes.js";
import { createGuideRouter } from "./demo/guide-routes.js";
import { createTtsRouter } from "./demo/tts-routes.js";
import { createImageRouter } from "./demo/image-routes.js";
import { createVideoRouter } from "./demo/video-routes.js";
import { createAvatarRouter } from "./avatar/routes.js";
import { createTencentProxyRouter } from "./demo/tencent-proxy-routes.js";

process.on("uncaughtException", (err) => {
  console.error("[api2] uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[api2] unhandledRejection:", err);
});

const port = Number(process.env.API2_PORT || process.env.PORT || 3002);

const trustedOrigins = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ||
  "http://127.0.0.1:4321,http://localhost:4321,https://www.lilnong.top,https://lilnong.top"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
// nginx is the only public entry point; preserve the visitor IP for per-IP limits.
app.set("trust proxy", "loopback");

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || trustedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Source"],
  }),
);

// IMPORTANT: mount Better Auth before express.json()
app.all("/api/auth/*", toNodeHandler(auth));

const globalJsonParser = express.json({ limit: "1mb" });
app.use((req, _res, next) => {
  // Demo routes carry their own JSON limit (base64 refs, long chat context).
  if (req.path.startsWith("/api/demo/")) return next();
  globalJsonParser(req, _res, next);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "lilnong-api2", auth: "better-auth" });
});

app.get("/api/me", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      authenticated: Boolean(session?.user),
      user: session?.user ?? null,
      session: session?.session ?? null,
    });
  } catch (err) {
    console.error("[api2] /api/me failed:", err);
    res.status(500).json({ ok: false, error: "session_error" });
  }
});

app.use("/api/learn", createLearnRouter(pool));
app.use("/api/demo", express.json({ limit: "30mb" }), createDemoRouter());
// swagger-typescript-api 服务端生成：Body 限流单独收紧到 4mb（生成器本身较重）。
app.use("/api/demo", express.json({ limit: "4mb" }), createSwaggerTsRouter());
app.use("/api/demo/compare", createCompareRouter());
app.use("/api/demo/guide", createGuideRouter());
app.use("/api/demo/tts", createTtsRouter());
app.use("/api/demo/image", express.json({ limit: "30mb" }), createImageRouter());
app.use("/api/demo/video", express.json({ limit: "30mb" }), createVideoRouter());
app.use("/api/demo/avatar", createAvatarRouter());
// Harness 依赖 monorepo 的 packages/quality-gates，该包未随 api2 单独部署到生产机。
// 用动态 import + try/catch 包裹，缺失依赖时优雅降级，避免拖垮整个 api2 进程。
try {
  const { createHarnessRouter } = await import("./demo/harness-routes.js");
  app.use("/api/demo", express.json({ limit: "30mb" }), createHarnessRouter());
} catch (err) {
  console.warn("[api2] harness router disabled (missing packages/quality-gates?):", err && err.message);
}
app.use("/api/demo/tencent-proxy", createTencentProxyRouter());

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`[api2] listening on http://127.0.0.1:${port}`);
});

server.on("upgrade", handleWsUpgrade);
