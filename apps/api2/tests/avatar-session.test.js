import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import express from "express";
import {
  createAvatarRouter,
  readAvatarEnv,
  buildSessionPayload,
} from "../src/avatar/routes.js";

const FULL_ENV = {
  ALIBABA_CLOUD_ACCESS_KEY_ID: "ak",
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: "sk",
  LINGMOU_CHAT_PROJECT_ID: "C1project",
  LINGMOU_INSTANCE_ID: "avatar_chatpost_public_cn-test",
  LINGMOU_SDK_LICENSE: "lic-123",
  LINGMOU_PLATFORM: "Web",
};

async function withServer(router, fn) {
  const app = express();
  app.use("/api/demo/avatar", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}/api/demo/avatar`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe("readAvatarEnv", () => {
  it("reports missing required vars", () => {
    const cfg = readAvatarEnv({ LINGMOU_CHAT_PROJECT_ID: "x" });
    assert.ok(cfg.missing.includes("ALIBABA_CLOUD_ACCESS_KEY_ID"));
    assert.ok(cfg.missing.includes("LINGMOU_INSTANCE_ID"));
  });

  it("applies defaults for endpoint and platform", () => {
    const cfg = readAvatarEnv(FULL_ENV);
    assert.deepEqual(cfg.missing, []);
    assert.equal(cfg.endpoint, "lingmou.cn-beijing.aliyuncs.com");
    assert.equal(cfg.platform, "Web");
    assert.equal(cfg.license, "lic-123");
  });
});

describe("buildSessionPayload", () => {
  it("passes license through only for client-rendered avatars", () => {
    const withAssets = buildSessionPayload(
      { data: { sessionId: "s", rtcParams: { appId: "a" }, avatarAssets: { url: "u" } } },
      { license: "lic-123" },
    );
    assert.equal(withAssets.license, "lic-123");

    const cloudOnly = buildSessionPayload(
      { data: { sessionId: "s", rtcParams: { appId: "a" } } },
      { license: "lic-123" },
    );
    assert.equal(cloudOnly.license, null);
    assert.equal(cloudOnly.avatarAssets, null);
  });
});

describe("POST /api/demo/avatar/session", () => {
  it("returns 503 with the missing var names when env is incomplete", async () => {
    const router = createAvatarRouter({ env: {} });
    await withServer(router, async (base) => {
      const res = await fetch(`${base}/session`, { method: "POST" });
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, "missing_env");
      assert.match(body.message, /ALIBABA_CLOUD_ACCESS_KEY_ID/);
    });
  });

  it("maps CreateChatSession response into session payload", async () => {
    const calls = [];
    const fakeClient = {
      async createChatSession(projectId, request) {
        calls.push({ projectId, request });
        return {
          body: {
            success: true,
            code: "200",
            requestId: "req-1",
            data: {
              sessionId: "sess-1",
              rtcParams: { appId: "app", channel: "ch", token: "tok" },
              avatarAssets: { url: "https://a.zip", secret: "sec", type: "AVATAR_3D_TRADITIONAL" },
            },
          },
        };
      },
    };
    const router = createAvatarRouter({
      env: FULL_ENV,
      createClient: () => fakeClient,
    });

    await withServer(router, async (base) => {
      const res = await fetch(`${base}/session`, { method: "POST" });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.sessionId, "sess-1");
      assert.equal(body.rtcParams.channel, "ch");
      assert.equal(body.avatarAssets.url, "https://a.zip");
      assert.equal(body.license, "lic-123");

      assert.equal(calls.length, 1);
      assert.equal(calls[0].projectId, "C1project");
      assert.equal(calls[0].request.instanceId, FULL_ENV.LINGMOU_INSTANCE_ID);
      assert.equal(calls[0].request.license, "lic-123");
      assert.equal(calls[0].request.platform, "Web");
    });
  });

  it("returns 502 with a readable message when the SDK call throws", async () => {
    const router = createAvatarRouter({
      env: FULL_ENV,
      createClient: () => ({
        async createChatSession() {
          const err = new Error("InvalidLicense");
          err.data = { Recommend: "https://api.aliyun.com/troubleshoot" };
          throw err;
        },
      }),
    });

    await withServer(router, async (base) => {
      const res = await fetch(`${base}/session`, { method: "POST" });
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.equal(body.error, "lingmou_request_failed");
      assert.equal(body.message, "InvalidLicense");
      assert.equal(body.recommend, "https://api.aliyun.com/troubleshoot");
    });
  });
});
