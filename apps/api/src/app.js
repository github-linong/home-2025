"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const config = require("./config/env");

const uploadRoutes = require("./routes/upload");
const legacyApiRoutes = require("./routes/legacy-api");
const corsDemoRoutes = require("./routes/cors-demo");
const proxyRoutes = require("./routes/proxy");
const wechatRoutes = require("./routes/wechat");
const douyinRoutes = require("./routes/douyin");
const musicRoutes = require("./routes/music");
const loggerRoutes = require("./routes/logger");
const invitationRoutes = require("./routes/invitation");
const tencentRoutes = require("./routes/tencent");
const miscRoutes = require("./routes/misc");
const contentViewsRoutes = require("./routes/content-views");

fs.mkdirSync(config.paths.uploads, { recursive: true });
fs.mkdirSync(config.paths.fontmin, { recursive: true });
fs.mkdirSync(config.paths.logs, { recursive: true });
fs.mkdirSync(config.paths.felog, { recursive: true });

function createApp() {
  const app = express();

  app.use(bodyParser.urlencoded({ limit: "30mb", extended: true }));
  app.use(bodyParser.json({ limit: "30mb" }));

  // Generated font subsets (createfont)
  app.use(
    "/static/fontmin",
    express.static(config.paths.fontmin, { fallthrough: true })
  );

  // Upload / AI endpoints (root paths)
  app.use(uploadRoutes);

  // Mounted routers — same prefixes as home-2023
  app.use("/wx", wechatRoutes);
  app.use("/invitation", invitationRoutes);
  app.use(loggerRoutes);
  app.use("/api3", douyinRoutes);
  app.use("/vapi", musicRoutes);

  // Content view counters (before catch-all POST /api/*)
  app.use(contentViewsRoutes);

  // Lightweight health for compose / probes (GET only; does not collide with POST /api/*)
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "lilnong-legacy-api" });
  });

  // POST /api/* legacy commands (OCR / mongo / memory)
  app.use("/api", legacyApiRoutes);

  app.use(corsDemoRoutes);
  app.use(proxyRoutes);
  app.use("/tencent_ai_api", tencentRoutes);
  app.use(miscRoutes);

  app.use((_req, res) => {
    res
      .status(404)
      .send(
        '<img title="微信公众号-前端linong" alt="微信公众号-前端linong" src="https://www.lilnong.top/static/img/wx-linong.jpg" style="width: 980px;min-width: calc( 100vw - 20px)">Sorry cant find that!'
      );
  });

  return app;
}

module.exports = { createApp };
