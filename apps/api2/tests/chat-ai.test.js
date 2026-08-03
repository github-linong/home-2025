import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import express from "express";
import { createDemoRouter } from "../src/demo/stream-routes.js";

const FULL_ENV = {
  DASHSCOPE_API_KEY: "test-key",
  DASHSCOPE_LLM_MODEL: "qwen-flash",
  NODE_ENV: "test",
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

const toChatAi = (base) => base.replace(/\/llm-stream$/, "/chat-ai");

describe("POST /api/demo/chat-ai", () => {
  it("streams a local mock reply when no API key is configured (non-production)", async () => {
    await withServer(createDemoRouter({ env: { NODE_ENV: "test" } }), async (base) => {
      const response = await fetch(toChatAi(base), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") || "", /text\/plain/);
      const text = await response.text();
      assert.match(text, /离线演示模式/);
    });
  });

  it("streams plain-text deltas from DashScope SSE with the site assistant system prompt", async () => {
    const encoder = new TextEncoder();
    const calls = [];
    const fetchImpl = async (_url, options) => {
      calls.push(options);
      assert.equal(JSON.parse(options.body).stream, true);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: "Astro " } }] })}\n\n`,
              ),
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: "是静态站点生成器。" } }] })}\n\ndata: [DONE]\n\n`,
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
      async (base) => {
        const response = await fetch(toChatAi(base), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "介绍 Astro" }] }),
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") || "", /text\/plain/);
        assert.equal(await response.text(), "Astro 是静态站点生成器。");
      },
    );

    const body = JSON.parse(calls[0].body);
    assert.equal(body.messages[0].role, "system");
    assert.match(body.messages[0].content, /小助手/);
    assert.match(body.messages[0].content, /lilnong\.top/);
    assert.equal(body.messages.at(-1).content, "介绍 Astro");
    assert.equal(calls[0].headers.Authorization, "Bearer test-key");
  });

  it("returns 503 in production when the API key is missing", async () => {
    await withServer(
      createDemoRouter({ env: { NODE_ENV: "production" } }),
      async (base) => {
        const response = await fetch(toChatAi(base), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
        });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).error, "llm_not_configured");
      },
    );
  });

  it("rejects empty messages with 400 before calling the model", async () => {
    let calls = 0;
    const router = createDemoRouter({
      env: FULL_ENV,
      fetchImpl: async () => {
        calls += 1;
      },
    });
    await withServer(router, async (base) => {
      const response = await fetch(toChatAi(base), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "invalid_messages");
    });
    assert.equal(calls, 0);
  });
});
