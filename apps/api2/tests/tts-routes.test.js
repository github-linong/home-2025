import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import express from "express";
import {
  createTtsRouter,
  isAllowedAudioUrl,
  normalizeAudioUrl,
  readTtsEnv,
} from "../src/demo/tts-routes.js";

const FULL_ENV = {
  DASHSCOPE_API_KEY: "test-key",
  DASHSCOPE_TTS_MODEL: "cosyvoice-v3-flash",
  DASHSCOPE_TTS_VOICE: "longanhuan",
};

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use("/api/demo/tts", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/api/demo/tts`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("CosyVoice configuration", () => {
  it("applies safe defaults", () => {
    const cfg = readTtsEnv(FULL_ENV);
    assert.equal(cfg.model, "cosyvoice-v3-flash");
    assert.equal(cfg.voice, "longanhuan");
    assert.match(cfg.endpoint, /^https:\/\/dashscope\.aliyuncs\.com\//);
  });

  it("only accepts HTTPS Aliyun audio URLs", () => {
    assert.equal(
      isAllowedAudioUrl(
        "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/output.wav",
      ),
      true,
    );
    assert.equal(
      normalizeAudioUrl(
        "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/output.wav",
      ),
      "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/output.wav",
    );
    assert.equal(isAllowedAudioUrl("http://127.0.0.1/private"), false);
    assert.equal(isAllowedAudioUrl("https://aliyuncs.com.evil.example/audio"), false);
  });
});

describe("POST /api/demo/tts", () => {
  it("returns 503 when the API key is missing", async () => {
    await withServer(createTtsRouter({ env: {} }), async (url) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "你好" }),
      });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "tts_not_configured");
    });
  });

  it("rejects empty and oversized text before calling DashScope", async () => {
    let calls = 0;
    const router = createTtsRouter({
      env: FULL_ENV,
      fetchImpl: async () => {
        calls += 1;
      },
    });
    await withServer(router, async (url) => {
      for (const text of ["", "x".repeat(801)]) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        assert.equal(response.status, 400);
      }
    });
    assert.equal(calls, 0);
  });

  it("proxies generated WAV bytes without exposing the API key", async () => {
    const calls = [];
    const wav = Uint8Array.from([82, 73, 70, 70, 1, 2, 3, 4]);
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            output: {
              audio: {
                url: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.wav",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(wav, {
        status: 200,
        headers: { "Content-Type": "audio/wav", "Content-Length": String(wav.length) },
      });
    };

    await withServer(
      createTtsRouter({ env: FULL_ENV, fetchImpl }),
      async (url) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "你好" }),
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") || "", /audio\/wav/);
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), wav);
      },
    );

    const requestBody = JSON.parse(calls[0].options.body);
    assert.equal(requestBody.model, "cosyvoice-v3-flash");
    assert.equal(requestBody.input.voice, "longanhuan");
    assert.equal(requestBody.input.format, "wav");
    assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
    assert.equal(calls[1].options.headers?.Authorization, undefined);
  });

  it("rate limits repeated synthesis requests", async () => {
    const router = createTtsRouter({
      env: FULL_ENV,
      maxRequests: 0,
    });
    await withServer(router, async (url) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "你好" }),
      });
      assert.equal(response.status, 429);
    });
  });
});
