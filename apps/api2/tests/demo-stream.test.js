import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import express from "express";
import {
  createDemoRouter,
  tokenizeForStream,
  DEFAULT_STREAM_TEXT,
} from "../src/demo/stream-routes.js";

describe("tokenizeForStream", () => {
  it("splits into word-sized chunks", () => {
    const tokens = tokenizeForStream("Hello world!");
    assert.deepEqual(tokens, ["Hello ", "world!"]);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(tokenizeForStream(""), []);
    assert.deepEqual(tokenizeForStream(null), []);
  });
});

describe("GET /api/demo/llm-stream", () => {
  it("streams plain text token by token", async () => {
    const app = express();
    app.use("/api/demo", createDemoRouter());
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/demo/llm-stream?delayMs=0`,
      );
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") || "", /text\/plain/);
      assert.ok(res.body);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunkCount += 1;
        full += decoder.decode(value, { stream: true });
      }
      full += decoder.decode();

      assert.equal(full, DEFAULT_STREAM_TEXT);
      assert.ok(chunkCount >= 2, "expected multiple stream chunks");
    } finally {
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it("prefixes custom prompt when provided", async () => {
    const app = express();
    app.use("/api/demo", createDemoRouter());
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/demo/llm-stream?delayMs=0&prompt=hi`,
      );
      const text = await res.text();
      assert.match(text, /^You asked: hi\n\n/);
      assert.ok(text.includes(DEFAULT_STREAM_TEXT));
    } finally {
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
