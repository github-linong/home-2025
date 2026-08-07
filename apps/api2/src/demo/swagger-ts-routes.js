import { Router } from "express";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

/**
 * In-memory sliding-window rate limiter (per key, e.g. per-IP).
 * Mirrors the pattern used across the other /api/demo routers.
 */
export function createRateLimiter({ maxRequests = 8, windowMs = 60_000 } = {}) {
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
 * Reject any remote $ref / URL inside the spec to prevent SSRF.
 * swagger-typescript-api resolves refs via @apidevtools/swagger-parser,
 * which would otherwise fetch attacker-controlled http(s) URLs from our server.
 */
function assertNoRemoteRefs(node, depth = 0) {
  if (depth > 200) return; // 防御性：异常深嵌套
  if (Array.isArray(node)) {
    for (const item of node) assertNoRemoteRefs(item, depth + 1);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string" && /^https?:\/\//i.test(v)) {
        throw new Error("规范中包含远程 $ref（" + v + "），出于安全考虑服务端拒绝解析外部地址");
      }
      assertNoRemoteRefs(v, depth + 1);
    }
  }
}

function isValidSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return false;
  const hasVersion = "openapi" in spec || "swagger" in spec;
  const hasContent = "paths" in spec || "components" in spec;
  return hasVersion && hasContent;
}

/**
 * POST /api/demo/swagger-ts
 * Server-side code generation. Body: { spec, generator, client, modular }
 *   generator: "openapi-typescript" (default-less) -> 仅类型 .d.ts；
 *              "swagger-typescript-api" -> 完整 fetch/axios 客户端。
 *
 * Security model:
 *  - Per-IP rate limit (createRateLimiter).
 *  - Body size capped by the express.json({ limit }) mounted alongside this router.
 *  - Input must be a recognizable OpenAPI / Swagger object (shape-validated).
 *  - Remote $ref / URL rejection prevents SSRF (no outbound fetch from our box).
 *  - Generators are invoked via their Node API (no shell) -> no command injection.
 *  - For swagger-typescript-api the spec is written to a random-named temp file under
 *    os.tmpdir() -> no path traversal; the file is removed in `finally`, and output:false
 *    means generated code is never written to disk.
 *  - openapi-typescript accepts the object in-memory, so it never touches the filesystem.
 */
export function createSwaggerTsRouter({ maxRequests = 8, windowMs = 60_000 } = {}) {
  const router = Router();
  const allowRequest = createRateLimiter({ maxRequests, windowMs });

  router.post("/swagger-ts", async (req, res) => {
    const clientKey = `swagger-ts:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    if (!allowRequest(clientKey)) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ ok: false, error: "rate_limited", message: "请求过于频繁，请稍后再试" });
      return;
    }

    const body = req.body || {};
    let spec = body.spec;
    if (spec == null && isValidSpec(body)) spec = body;

    if (typeof spec === "string") {
      try {
        spec = JSON.parse(spec);
      } catch {
        res.status(400).json({ ok: false, error: "invalid_json", message: "spec 不是合法 JSON" });
        return;
      }
    }
    if (!isValidSpec(spec)) {
      res.status(400).json({
        ok: false,
        error: "invalid_spec",
        message: "请提供合法的 Swagger 2.0 / OpenAPI 3.x 规范（需包含 openapi/swagger 字段，以及 paths 或 components）",
      });
      return;
    }
    try {
      assertNoRemoteRefs(spec);
    } catch (e) {
      res.status(400).json({ ok: false, error: "unsafe_ref", message: e.message });
      return;
    }

    const generator = body.generator === "openapi-typescript" ? "openapi-typescript" : "swagger-typescript-api";

    try {
      if (generator === "openapi-typescript") {
        let openapiTS;
        try {
          const mod = await import("openapi-typescript");
          // 该包在 Node ESM 下仅暴露 default（即 openapiTS 函数），命名导出未被 cjs-module-lexer 识别，这里做兜底。
          openapiTS = mod.openapiTS || (typeof mod.default === "function" ? mod.default : mod.default?.openapiTS);
        } catch {
          res.status(503).json({ ok: false, error: "generator_unavailable", message: "服务端未安装 openapi-typescript" });
          return;
        }
        if (typeof openapiTS !== "function") {
          res.status(503).json({ ok: false, error: "generator_unavailable", message: "openapi-typescript 导出异常" });
          return;
        }
        // v6 接受对象输入，完全内存计算，不会发起任何外部请求（远程 $ref 已在前面拦截）。
        const code = await openapiTS(spec, { exportType: true });
        if (typeof code !== "string") throw new Error("openapi-typescript 未返回字符串");
        const filename = "schema.d.ts";
        res.json({ ok: true, generator, filename, code, files: [{ name: filename, content: code }] });
        return;
      }

      // swagger-typescript-api：需要把 spec 写入随机临时文件再交给其 input 解析（无 shell，output:false 不落盘生成物）。
      const dir = await mkdtemp(join(tmpdir(), "swagger-ts-"));
      const file = join(dir, randomBytes(12).toString("hex") + ".json");
      try {
        await writeFile(file, JSON.stringify(spec), "utf8");

        let generateApi;
        try {
          ({ generateApi } = await import("swagger-typescript-api"));
        } catch {
          res.status(503).json({ ok: false, error: "generator_unavailable", message: "服务端未安装 swagger-typescript-api" });
          return;
        }

        const client = body.client === "axios" ? "axios" : "fetch";
        const modular = body.modular === true;
        const result = await generateApi({
          input: file,
          output: false,
          httpClientType: client,
          modular,
          silent: true,
        });

        const files = Array.isArray(result?.files)
          ? result.files.map((f) => ({
              name: (f.fileName || "api") + (f.fileExtension ? "." + String(f.fileExtension).replace(/^\./, "") : ""),
              content: typeof f.fileContent === "string" ? f.fileContent : "",
            }))
          : [];
        const code = files.map((f) => f.content).join("\n\n");

        res.json({ ok: true, generator, filename: files[0]?.name || "api.ts", code, files });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("[api2] swagger-ts generation failed:", e);
      res.status(502).json({ ok: false, error: "generation_failed", message: e?.message || "生成失败" });
    }
  });

  return router;
}
