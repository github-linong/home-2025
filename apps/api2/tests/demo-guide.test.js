import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import express from "express";
import {
  buildGuideSystemPrompt,
  createGuideRouter,
  parseGuideReply,
  sanitizePanels,
} from "../src/demo/guide-routes.js";

const FULL_ENV = {
  DASHSCOPE_API_KEY: "test-key",
  DASHSCOPE_LLM_MODEL: "qwen-flash",
};

const PANELS = [
  {
    id: "employment",
    title: "就业率",
    summary: "城东区就业率97.2%全市最高",
    anchors: ["employment_top_rate", "employment_trend"],
  },
  { id: "medical", title: "医保参保", summary: "参保率98.6%", anchors: ["medical_coverage"] },
];

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use("/api/demo/guide", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/api/demo/guide`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("guide helpers", () => {
  it("sanitizes panels: id pattern, dedupe, caps and trims", () => {
    const panels = sanitizePanels([
      { id: "employment", title: " 就业率 ", summary: " 高 " },
      { id: "employment", title: "重复", summary: "重复" },
      { id: "Bad Id!", title: "非法", summary: "非法" },
      { id: "x".repeat(50), title: "过长", summary: "过长" },
      null,
    ]);
    assert.deepEqual(panels, [
      { id: "employment", title: "就业率", summary: "高", anchors: [] },
    ]);
    assert.deepEqual(sanitizePanels("not-array"), []);
  });

  it("builds a system prompt that lists panel ids and data", () => {
    const prompt = buildGuideSystemPrompt(PANELS, "运行态势：异常工单7，设备健康度92.1");
    assert.match(prompt, /id=employment｜anchors=employment_top_rate,employment_trend｜就业率｜城东区就业率97\.2%全市最高/);
    assert.match(prompt, /anchors=employment_top_rate,employment_trend/);
    assert.match(prompt, /"version":2/);
    assert.match(prompt, /"type":"focus"/);
    assert.match(prompt, /anchorId/);
    assert.match(prompt, /补充运行上下文：/);
    assert.match(prompt, /异常工单7/);
    assert.match(prompt, /屏幕中间原地讲解/);
    assert.doesNotMatch(prompt, /走到对应面板旁边讲解/);
  });

  it("keeps valid focus events and clamps at", () => {
    const reply = parseGuideReply(
      '{"type":"avatar_response","version":2,"speech":{"text":"城东区就业率最高。"},"timeline":[{"type":"focus","target":"employment","anchorId":"employment_top_rate","at":1.5}]}',
      PANELS,
    );
    assert.deepEqual(reply, {
      type: "avatar_response",
      version: 2,
      speech: { text: "城东区就业率最高。", language: "zh-CN" },
      timeline: [
        { type: "focus", target: "employment", anchorId: "employment_top_rate", at: 0.9 },
      ],
    });
  });

  it("drops invalid anchorId while keeping focus target", () => {
    const reply = parseGuideReply(
      '{"speech":{"text":"看这里。"},"timeline":[{"type":"focus","target":"employment","anchorId":"hacked","at":0.2}]}',
      PANELS,
    );
    assert.deepEqual(reply.timeline, [{ type: "focus", target: "employment", at: 0.2 }]);
  });

  it("drops focus targets outside the requested panels", () => {
    const reply = parseGuideReply(
      '{"speech":{"text":"看这里。"},"timeline":[{"type":"focus","target":"hacked","at":0},{"type":"focus","target":"medical","at":0.5},{"type":"motion","name":"point","at":0}]}',
      PANELS,
    );
    assert.deepEqual(reply.timeline, [
      { type: "focus", target: "medical", at: 0.5 },
    ]);
  });

  it("falls back to plain text when the reply is not JSON", () => {
    const reply = parseGuideReply("大屏上没有这项数据。", PANELS);
    assert.deepEqual(reply, {
      type: "avatar_response",
      version: 2,
      speech: { text: "大屏上没有这项数据。", language: "zh-CN" },
      timeline: [],
    });
  });
});

describe("POST /api/demo/guide", () => {
  it("returns 503 when the API key is missing", async () => {
    await withServer(createGuideRouter({ env: {} }), async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hi", panels: PANELS }),
      });
      assert.equal(res.status, 503);
    });
  });

  it("rejects requests without valid panels", async () => {
    await withServer(createGuideRouter({ env: FULL_ENV }), async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hi", panels: [] }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error, "invalid_panels");
    });
  });

  it("proxies to DashScope and returns a validated message", async () => {
    const fetchImpl = async (endpoint, init) => {
      assert.match(endpoint, /dashscope/);
      const body = JSON.parse(init.body);
      assert.equal(body.messages[0].role, "system");
      assert.match(body.messages[0].content, /id=employment/);
      assert.match(body.messages[0].content, /运行态势：城东园区效率领先/);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"type":"avatar_response","version":2,"speech":{"text":"城东区就业率97.2%最高。"},"timeline":[{"type":"focus","target":"employment","anchorId":"employment_top_rate","at":0}]}',
              },
            },
          ],
        }),
        { status: 200 },
      );
    };
    await withServer(
      createGuideRouter({ env: FULL_ENV, fetchImpl }),
      async (url) => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: "哪个区就业率最高",
            panels: PANELS,
            context: "运行态势：城东园区效率领先",
          }),
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.message.version, 2);
        assert.deepEqual(body.message.timeline, [
          { type: "focus", target: "employment", anchorId: "employment_top_rate", at: 0 },
        ]);
      },
    );
  });

  it("rate limits repeated requests", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200 },
      );
    await withServer(
      createGuideRouter({ env: FULL_ENV, fetchImpl, maxRequests: 1 }),
      async (url) => {
        const request = () =>
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: "hi", panels: PANELS }),
          });
        const first = await request();
        assert.equal(first.status, 200);
        const second = await request();
        assert.equal(second.status, 429);
      },
    );
  });
});
