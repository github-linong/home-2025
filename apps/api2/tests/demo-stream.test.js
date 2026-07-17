import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import express from "express";
import {
  createDemoRouter,
  parseAvatarReply,
  parseSseDataLine,
  readLlmEnv,
} from "../src/demo/stream-routes.js";

const FULL_ENV = {
  DASHSCOPE_API_KEY: "test-key",
  DASHSCOPE_LLM_MODEL: "qwen-flash",
};

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use("/api/demo", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/api/demo/llm-stream`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("Qwen stream helpers", () => {
  it("applies safe defaults", () => {
    const cfg = readLlmEnv(FULL_ENV);
    assert.equal(cfg.model, "qwen-flash");
    assert.match(cfg.endpoint, /^https:\/\/dashscope\.aliyuncs\.com\//);
  });

  it("extracts only assistant text from SSE data lines", () => {
    assert.equal(
      parseSseDataLine('data: {"choices":[{"delta":{"content":"你好"}}]}'),
      "你好",
    );
    assert.equal(parseSseDataLine("data: [DONE]"), null);
    assert.equal(parseSseDataLine(": keep-alive"), null);
  });

  it("validates structured avatar replies and semantic motion allowlist", () => {
    assert.deepEqual(
      parseAvatarReply(
        '{"type":"avatar_response","version":1,"speech":{"text":"挥挥手，再指向前方。","language":"zh-CN"},"timeline":[{"type":"motion","name":"point","at":0.7},{"type":"motion","name":"wave_right","at":0}]}',
      ),
      {
        type: "avatar_response",
        version: 1,
        speech: { text: "挥挥手，再指向前方。", language: "zh-CN" },
        timeline: [
          { type: "motion", name: "wave_right", at: 0 },
          { type: "motion", name: "point", at: 0.7 },
        ],
      },
    );
    assert.deepEqual(
      parseAvatarReply(
        '{"speech":{"text":"我来挥手。"},"timeline":[{"type":"motion","name":"wave_right","at":1.2}]}',
        "请用左手挥手",
      ),
      {
        type: "avatar_response",
        version: 1,
        speech: { text: "我来挥手。", language: "zh-CN" },
        timeline: [{ type: "motion", name: "wave_left", at: 0.95 }],
      },
    );
    assert.deepEqual(
      parseAvatarReply(
        '{"type":"unsafe","version":999,"speech":{"text":"危险动作"},"timeline":[{"type":"script","name":"deleteEverything","at":0}]}',
      ),
      {
        type: "avatar_response",
        version: 1,
        speech: { text: "危险动作", language: "zh-CN" },
        timeline: [],
      },
    );
  });

  it("accepts side step motions in the allowlist", () => {
    const reply = parseAvatarReply(
      '{"speech":{"text":"我先往左边走两步，再走回来。"},"timeline":[{"type":"motion","name":"side_step_left","at":0.1},{"type":"motion","name":"side_step_right","at":0.6}]}',
    );
    assert.deepEqual(reply.timeline, [
      { type: "motion", name: "side_step_left", at: 0.1 },
      { type: "motion", name: "side_step_right", at: 0.6 },
    ]);
  });

  it("accepts the turn_around motion in the allowlist", () => {
    const reply = parseAvatarReply(
      '{"speech":{"text":"我来转个圈。"},"timeline":[{"type":"motion","name":"turn_around","at":0.2}]}',
    );
    assert.deepEqual(reply.timeline, [
      { type: "motion", name: "turn_around", at: 0.2 },
    ]);
  });

  it("limits motion timelines to six entries", () => {
    const motions = Array.from({ length: 8 }, (_, index) => ({
      name: "applause",
      at: index / 8,
    }));
    const timeline = motions.map((motion) => ({ type: "motion", ...motion }));
    const reply = parseAvatarReply(
      JSON.stringify({ speech: { text: "开始手势舞。" }, timeline }),
    );
    assert.equal(reply.timeline.length, 6);
  });

  it("falls back safely when the model returns invalid JSON", () => {
    assert.deepEqual(parseAvatarReply("普通文本"), {
      type: "avatar_response",
      version: 1,
      speech: { text: "普通文本", language: "zh-CN" },
      timeline: [],
    });
  });
});

describe("POST /api/demo/llm-stream", () => {
  it("returns 503 when the API key is missing", async () => {
    await withServer(createDemoRouter({ env: {} }), async (url) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "你好" }),
      });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "llm_not_configured");
    });
  });

  it("rejects empty and oversized prompts before calling DashScope", async () => {
    let calls = 0;
    const router = createDemoRouter({
      env: FULL_ENV,
      fetchImpl: async () => {
        calls += 1;
      },
    });
    await withServer(router, async (url) => {
      for (const prompt of ["", "x".repeat(1_001)]) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        assert.equal(response.status, 400);
      }
    });
    assert.equal(calls, 0);
  });

  it("parses DashScope SSE chunks into a structured avatar reply", async () => {
    const calls = [];
    const encoder = new TextEncoder();
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(
        new ReadableStream({
          start(controller) {
            const chunks = [
              '{"type":"avatar_response","version":1,"speech":{"text":"你好，',
              '我是数字人。","language":"zh-CN"},"timeline":[{"type":"motion","name":"wave_right","at":0},{"type":"motion","name":"thumbs_up","at":0.6}]}',
            ];
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: chunks[0] } }] })}\n\n`,
              ),
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: chunks[1] } }] })}\n\ndata: [DONE]\n\n`,
              ),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    };

    await withServer(
      createDemoRouter({ env: FULL_ENV, fetchImpl }),
      async (url) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "介绍一下你自己" }),
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") || "", /application\/json/);
        assert.deepEqual(await response.json(), {
          ok: true,
          message: {
            type: "avatar_response",
            version: 1,
            speech: { text: "你好，我是数字人。", language: "zh-CN" },
            timeline: [
              { type: "motion", name: "wave_right", at: 0 },
              { type: "motion", name: "thumbs_up", at: 0.6 },
            ],
          },
        });
      },
    );

    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.model, "qwen-flash");
    assert.equal(body.stream, true);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.messages[1].content, "介绍一下你自己");
    assert.match(body.messages[0].content, /简体中文/);
    assert.match(body.messages[0].content, /100个汉字/);
    assert.match(body.messages[0].content, /最多6项/);
    assert.match(body.messages[0].content, /每15个汉字最多安排1个动作/);
    assert.match(body.messages[0].content, /side_step_left/);
    assert.match(body.messages[0].content, /turn_around/);
    assert.match(body.messages[0].content, /avatar_response/);
    assert.match(body.messages[0].content, /wave_right/);
    assert.equal(body.max_tokens, 420);
    assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  });

  it("rate limits repeated model requests", async () => {
    await withServer(
      createDemoRouter({ env: FULL_ENV, maxRequests: 0 }),
      async (url) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "你好" }),
        });
        assert.equal(response.status, 429);
      },
    );
  });

  it("returns 502 without exposing upstream details", async () => {
    const router = createDemoRouter({
      env: FULL_ENV,
      fetchImpl: async () =>
        new Response("sensitive upstream detail", { status: 401 }),
    });
    await withServer(router, async (url) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "你好" }),
      });
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.equal(body.error, "llm_request_failed");
      assert.doesNotMatch(JSON.stringify(body), /sensitive/);
    });
  });
});
