// 腾讯地图 WebService 代理端点。
// 浏览器因 CORS 无法直接 fetch apis.map.qq.com；此端点由服务端转发，
// Key 藏在服务端环境变量（TENCENT_MAP_KEY），避免泄露到前端。
// 仅允许转发到腾讯地图 WebService 的指定路径前缀，杜绝 SSRF。
import { Router } from "express";

const DEFAULT_KEY = "XNGBZ-MF3HD-EJP4Z-P2D7W-72HCK-ETBJ3";
const HOST = "https://apis.map.qq.com";
const ALLOWED_PREFIXES = [
  "/ws/",          // 常规 WebService（搜索/路线/距离/地址/定位/坐标/室内/轨迹云WS版）
  "/staticmap/",   // 静态地图
  "/place_cloud/", // 地点云
  "/data_layer/",  // 数据图层 / 我的数据（LBMP）
  "/tracks/",      // 轨迹云（创建终端等 /tracks/entity/*）
];

function createTencentProxyRouter() {
  const router = Router();

  async function handle(req, res) {
    try {
      const path = String(req.query.path || "");
      if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
        return res.status(400).json({
          status: 400,
          message: "invalid path prefix; allowed: " + ALLOWED_PREFIXES.join(", "),
        });
      }
      if (path.includes("://") || path.includes("..")) {
        return res.status(400).json({ status: 400, message: "invalid path" });
      }

      const key = process.env.TENCENT_MAP_KEY || DEFAULT_KEY;
      const url = new URL(HOST + path);
      url.searchParams.set("key", key);

      // 透传其余 query 参数（排除 path / key 自身）
      for (const [k, v] of Object.entries(req.query)) {
        if (k === "path" || k === "key") continue;
        if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
        else url.searchParams.append(k, String(v));
      }

      const method =
        req.method === "POST" || req.method === "PUT" || req.method === "DELETE"
          ? req.method
          : "GET";

      const fetchOpts = { method, signal: AbortSignal.timeout(8000) };

      // 仅对带 JSON body 的写操作转发 body；若 body 未自带 key，则补入服务端 key。
      if (
        method !== "GET" &&
        method !== "HEAD" &&
        req.body &&
        typeof req.body === "object" &&
        !Buffer.isBuffer(req.body)
      ) {
        const bodyObj = Object.assign({}, req.body);
        if (!bodyObj.key) bodyObj.key = key;
        fetchOpts.headers = { "Content-Type": "application/json" };
        fetchOpts.body = JSON.stringify(bodyObj);
      }

      const upstream = await fetch(url.toString(), fetchOpts);
      const text = await upstream.text();
      res.set("Cache-Control", "no-store");
      const ct = upstream.headers.get("content-type");
      if (ct) res.set("Content-Type", ct);
      res.status(upstream.status).send(text);
    } catch (err) {
      console.error("[tencent-proxy] error:", err);
      res.status(502).json({
        status: 502,
        message: "proxy_error",
        detail: String((err && err.message) || err),
      });
    }
  }

  // GET（读）+ POST/PUT/DELETE（写，如地点云存储 API）统一由本处理。
  router.all("/", handle);

  return router;
}

export { createTencentProxyRouter };
