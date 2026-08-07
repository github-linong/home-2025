import { Router } from "express";
import { writeFile, mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join, relative, basename as pathBasename, dirname } from "path";
import { randomBytes } from "crypto";
import { execSync } from "node:child_process";

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
 *  - Programmatic generators invoked via Node API (no shell).
 *  - openapi-typescript-codegen invoked via npx --no-install with trusted absolute paths only -> no shell injection.
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

    const generator = body.generator;
    const allowed = [
      "openapi-typescript",
      "swagger-typescript-api",
      "hey-api",
      "orval",
      "kubb",
      "openapi-typescript-codegen",
    ];
    if (!allowed.includes(generator)) {
      res.status(400).json({
        ok: false, error: "unknown_generator",
        message: "未知的生成器：'" + generator + "'。可用: " + allowed.join(", "),
      });
      return;
    }

    // 遍历 output 目录，收集所有 .ts / .d.ts 文件（保留相对路径）
    const walkTsDir = async (outDir) => {
      const { readdir: rd, stat: st } = await import("fs/promises");
      const files = [];
      const walk = async (p) => {
        for (const name of await rd(p)) {
          const full = join(p, name);
          const s = await st(full);
          if (s.isDirectory()) await walk(full);
          else if (name.endsWith(".ts") || name.endsWith(".d.ts")) {
            files.push({ path: relative(outDir, full).replace(/\\/g, "/"), content: await readFile(full, "utf8") });
          }
        }
      };
      await walk(outDir);
      return files;
    };

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
        const otsOpts = { exportType: true };
        if (body.enumStyle === "enum") otsOpts.enum = true;
        const code = await openapiTS(spec, otsOpts);
        if (typeof code !== "string") throw new Error("openapi-typescript 未返回字符串");
        const filename = "schema.d.ts";
        res.json({ ok: true, generator, filename, code, files: [{ path: filename, content: code }] });
        return;
      }

      // swagger-typescript-api：输出完整客户端（fetch / axios），可 modular 多文件。
      if (generator === "swagger-typescript-api") {
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
            input: file, output: false, httpClientType: client, modular, silent: true,
          });
          const files = Array.isArray(result?.files)
            ? result.files.map((f) => ({
                path: (f.fileName || "api") + (f.fileExtension ? "." + String(f.fileExtension).replace(/^\./, "") : ""),
                content: typeof f.fileContent === "string" ? f.fileContent : "",
              }))
            : [];
          const code = files.map((f) => f.content).join("\n\n");
          res.json({ ok: true, generator, filename: files[0]?.path || "api.ts", code, files });
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
        return;
      }

      // ---------- Kubb：程序化 API 生成 TypeScript 类型 ----------
      if (generator === "kubb") {
        const dir = await mkdtemp(join(tmpdir(), "swagger-ts-"));
        const file = join(dir, randomBytes(12).toString("hex") + ".json");
        await writeFile(file, JSON.stringify(spec), "utf8");
        try {
          let build, defineConfig, pluginOas, pluginTs;
          try {
            const core = await import("@kubb/core");
            const oas = await import("@kubb/plugin-oas");
            const ts = await import("@kubb/swagger-ts");
            build = core.build;
            defineConfig = core.defineConfig;
            pluginOas = oas.pluginOas;
            pluginTs = ts.pluginTs;
          } catch {
            res.status(503).json({ ok: false, error: "generator_unavailable", message: "服务端未安装 Kubb 相关依赖" });
            return;
          }

          // 收集用户勾选的插件
          const selectedPlugins = Array.isArray(body.kubbPlugins) ? body.kubbPlugins : ["ts"];
          const kubbPlugins = [pluginOas()];
          if (selectedPlugins.includes("ts")) kubbPlugins.push(pluginTs());
          // 可选插件：尝试动态加载，失败则静默跳过
          const optPlugins = { zod: "@kubb/swagger-zod", msw: "@kubb/swagger-msw", faker: "@kubb/swagger-faker" };
          for (const [name, pkgName] of Object.entries(optPlugins)) {
            if (selectedPlugins.includes(name)) {
              try {
                const mod = await import(pkgName);
                const factory = mod.pluginZod || mod.pluginMsw || mod.pluginFaker || mod.default || mod;
                if (typeof factory === "function") kubbPlugins.push(factory());
              } catch { /* 插件未安装，跳过 */ }
            }
          }

          const outDir = join(dir, "out");
          await build({
            config: defineConfig({
              input: { path: file },
              output: { path: outDir },
              plugins: kubbPlugins,
            }),
          });

          const files = await walkTsDir(outDir);
          const code = files.map((f) => f.content).join("\n\n");
          res.json({ ok: true, generator, filename: files[0]?.path || "index.ts", code, files: files.length ? files : [{ path: "index.ts", content: code }] });
        } catch (err) {
          res.status(502).json({ ok: false, error: "generation_failed", message: "Kubb 执行失败：" + (err.stderr || err.message) });
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
        return;
      }

      // ---------- CLI 生成器（openapi-typescript-codegen）----------
      // 使用 execSync 调用 npx --no-install（只用本地已安装版本）。
      const client = typeof body.codegenClient === "string" ? body.codegenClient : "fetch";
      const cliGenerators = {
        "openapi-typescript-codegen": {
          pkg: "openapi-typescript-codegen",
          bin: "openapi",
          args: (sf, od) => ["--input", sf, "--output", od, "--client", client, "--exportSchemas", "true"],
          fallback: `npm i -D openapi-typescript-codegen && npx openapi --input ./swagger.json --output ./api --client ${client}`,
        },
      };

      if (generator in cliGenerators) {
        const cliMeta = cliGenerators[generator];
        const dir = await mkdtemp(join(tmpdir(), "swagger-ts-"));
        const file = join(dir, randomBytes(12).toString("hex") + ".json");
        try {
          await writeFile(file, JSON.stringify(spec), "utf8");
          const outDir = join(dir, "out");
          const args = cliMeta.args(file, outDir);
          execSync(`npx --no-install --yes ${cliMeta.bin} ${args.map((a) => `"${a}"`).join(" ")}`, {
            stdio: "pipe",
            timeout: 120_000,
          });
          const files = await walkTsDir(outDir);
          const code = files.map((f) => f.content).join("\n\n");
          const mainFile = files.find((f) => /index|api/i.test(f.path)) || files[0];
          res.json({
            ok: true, generator,
            filename: mainFile?.path || "api.ts",
            code,
            files: files.length ? files : [{ path: "api.ts", content: code }],
          });
        } catch (err) {
          const stderr = err.stderr ? (typeof err.stderr === "string" ? err.stderr : err.stderr.toString()) : "";
          const combined = stderr + "\n" + (err.message || "");
          const isBinaryMissing = /command not found|ENOENT|could not determine executable/i.test(combined);
          let hint;
          if (isBinaryMissing) {
            const hintPrefix = cliMeta.isGlobalCli ? `${cliMeta.pkg} 需要系统级 CLI 而非 npm 包：` : `服务端未安装 ${cliMeta.pkg}。`;
            hint = `${hintPrefix}${cliMeta.note ? " " + cliMeta.note : ""}\n\n本地 CLI 用法：\n  ${cliMeta.fallback}`;
          } else {
            // 过滤 JS 源码 dump，只提取关键错误行
            const keyLines = combined.split("\n").filter((l) =>
              /Error:|fatal|exception|RuntimeException|Unable to/i.test(l) &&
              !/require\(|exports\.|defineProperty|COMMANDER/i.test(l) &&
              l.length < 600
            ).slice(0, 3);
            const keyMsg = keyLines.length ? keyLines.join("\n") : (err.message || "").slice(0, 400);
            hint = `${cliMeta.pkg} 执行失败。${cliMeta.note ? " " + cliMeta.note : ""}\n\n${keyMsg}`;
          }
          res.status(502).json({ ok: false, error: "generation_failed", message: hint });
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
        return;
      }

      // ---------- 新生成器共用临时文件 + CLI 调用模式 ----------
      // 均仅支持服务端 Node 环境运行，需要 Node >= 20。
      const generatorMeta = {
        "hey-api": {
          pkg: "@hey-api/openapi-ts",
          fallback: "npx @hey-api/openapi-ts --input ./openapi.json --output ./api --plugins @hey-api/client-fetch",
          importFn: async () => {
            const mod = await import("@hey-api/openapi-ts");
            return mod.createClient || mod.createClientDefault;
          },
          invoke: async (fn, tmpDir, tmpFile) => {
            const outDir = join(tmpDir, "out");
            const plugins = Array.isArray(body.plugins) && body.plugins.length
              ? body.plugins
              : ["@hey-api/client-fetch"];
            await fn({
              plugins,
              input: { path: tmpFile },
              output: { path: outDir, postProcess: [] },
            });
            return outDir;
          },
        },
        orval: {
          pkg: "orval",
          fallback: "npx orval --input ./openapi.json --output ./api",
          importFn: async () => {
            const { generate } = await import("orval");
            return generate;
          },
          invoke: async (fn, tmpDir, tmpFile) => {
            const outDir = join(tmpDir, "out");
            const client = typeof body.orvalClient === "string" ? body.orvalClient : "axios";
            await fn({
              input: { target: tmpFile },
              output: { target: outDir, client, clean: false },
            });
            return outDir;
          },
        },
      };

      const meta = generatorMeta[generator];
      if (!meta) {
        res.status(400).json({ ok: false, error: "unknown_generator", message: "不支持的生成器：" + generator });
        return;
      }

      const dir = await mkdtemp(join(tmpdir(), "swagger-ts-"));
      const file = join(dir, randomBytes(12).toString("hex") + ".json");
      try {
        await writeFile(file, JSON.stringify(spec), "utf8");

        // 尝试 programmatic API（若安装且 Node 版本兼容）
        let outDir;
        let fn;
        try {
          fn = await meta.importFn();
        } catch (importErr) {
          const errDetail = importErr.message || importErr.code || "未知错误";
          const msg = importErr.code === "ERR_MODULE_NOT_FOUND"
            ? meta.pkg + " 未安装在 api2 中。请运行 npm i " + meta.pkg + "（需 Node >= 20）。\n\n本地 CLI 用法：\n  " + meta.fallback
            : meta.pkg + " 初始化失败：" + errDetail + "\n\n本地 CLI 用法：\n  " + meta.fallback;
          res.status(503).json({ ok: false, error: "generator_unavailable", message: msg });
          return;
        }

        if (typeof fn === "function" && meta.invoke) {
          try {
            outDir = await meta.invoke(fn, dir, file);
          } catch (invokeErr) {
            const msg = meta.pkg + " 生成过程出错：" + (invokeErr.message || "未知错误");
            res.status(502).json({ ok: false, error: "generation_failed", message: msg });
            return;
          }
        }

        if (outDir) {
          const files = await walkTsDir(outDir);
          const code = files.map((f) => f.content).join("\n\n");
          res.json({ ok: true, generator, filename: files[0]?.path || "api.ts", code, files: files.length ? files : [{ path: "api.ts", content: code }] });
        } else {
          res.json({ ok: true, generator, filename: "api.ts", code: "", files: [] });
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("[api2] swagger-ts generation failed:", e);
      res.status(502).json({ ok: false, error: "generation_failed", message: e?.message || "生成失败" });
    }
  });

  // POST /api/demo/swagger-ts/validate — Redocly 规范校验
  router.post("/swagger-ts/validate", async (req, res) => {
    const clientKey = `swagger-ts-validate:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    if (!allowRequest(clientKey)) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ ok: false, error: "rate_limited", message: "请求过于频繁，请稍后再试" });
      return;
    }
    const body = req.body || {};
    const spec = body.spec;
    if (!spec || typeof spec !== "object") {
      return res.status(400).json({ ok: false, error: "invalid_spec", message: "缺少 spec（需传入已解析的 OpenAPI 对象）。" });
    }
    try {
      const { lintFromString, createConfig } = await import("@redocly/openapi-core");
      const specStr = JSON.stringify(spec);
      const config = await createConfig({ extends: ["all"] });
      const lintResults = await lintFromString({
        source: specStr,
        absoluteRef: "/openapi.json",
        config,
      });

      const results = Array.isArray(lintResults)
        ? lintResults.map((r) => ({
            severity: r.severity || "error",
            message: r.message || "",
            ruleId: r.ruleId || "",
            location: Array.isArray(r.location) ? r.location : [],
          }))
        : [];

      res.json({ ok: true, generator: "redocly", results });
    } catch (e) {
      if (e.code === "ERR_MODULE_NOT_FOUND") {
        return res.status(503).json({
          ok: false,
          error: "generator_unavailable",
          message: "@redocly/openapi-core 未安装在 api2 中。运行 npm i @redocly/openapi-core 安装。",
        });
      }
      console.error("[api2] redocly validation failed:", e);
      res.status(502).json({ ok: false, error: "validation_failed", message: "Redocly 校验引擎异常：" + e.message });
    }
  });

  return router;
}
