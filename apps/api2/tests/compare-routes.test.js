import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import crypto from "node:crypto";
import net from "node:net";
import express from "express";
import { createCompareRouter, handleWsUpgrade } from "../src/demo/compare-routes.js";

async function withServer(fn, routerOpts = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.text());
  app.use("/api/demo/compare", createCompareRouter(routerOpts));
  const server = http.createServer(app);
  server.on("upgrade", (req, socket, head) =>
    handleWsUpgrade(req, socket, head, routerOpts),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`, port);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

function fakeDashScopeFetch(tokens = ["前端", " ", "流式"]) {
  const encoder = new TextEncoder();
  const body =
    tokens
      .map(
        (t) =>
          `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`,
      )
      .join("") + "data: [DONE]\n\n";
  return async () =>
    new Response(encoder.encode(body), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
}

// ── GET /once ─────────────────────────────────────────────────────────────────
describe("GET /once", () => {
  it("returns valid JSON with text and ts fields", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/once`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.text, "string");
      assert.ok(data.text.length > 0);
      assert.equal(typeof data.ts, "number");
    });
  });
});

// ── GET /stream ───────────────────────────────────────────────────────────────
describe("GET /stream", () => {
  it("streams plain-text chunks and content-type is text/plain", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/stream?delay=0`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-type").includes("text/plain"));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let received = "";
      let chunkCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        chunkCount++;
      }
      assert.ok(received.length > 0, "should receive non-empty text");
      assert.ok(chunkCount >= 1, "should receive at least one chunk");
    });
  });
});

// ── GET /sse ──────────────────────────────────────────────────────────────────
describe("GET /sse", () => {
  it("streams SSE events with data lines, ending with [DONE]", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/sse?delay=0`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-type").includes("text/event-stream"));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
      }

      const lines = raw.split("\n").filter((l) => l.startsWith("data:"));
      assert.ok(lines.length >= 2, "should have at least 2 data lines");

      const lastLine = lines[lines.length - 1].trim();
      assert.equal(lastLine, "data: [DONE]");

      // Validate one intermediate JSON payload
      const firstPayload = lines[0].replace(/^data:\s*/, "").trim();
      const parsed = JSON.parse(firstPayload);
      assert.equal(typeof parsed.word, "string");
      assert.equal(typeof parsed.index, "number");
    });
  });
});

// ── GET /long-poll ────────────────────────────────────────────────────────────
describe("GET /long-poll", () => {
  it("responds after ~1.5s with JSON containing seq field", async () => {
    await withServer(async (base) => {
      const t0 = Date.now();
      const res = await fetch(`${base}/api/demo/compare/long-poll?seq=3`);
      const elapsed = Date.now() - t0;
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.seq, 3);
      assert.equal(typeof data.text, "string");
      assert.equal(typeof data.ts, "number");
      assert.ok(elapsed >= 1000, `expected ≥1000ms, got ${elapsed}ms`);
    });
  });
});

// ── GET /jsonp ────────────────────────────────────────────────────────────────
describe("GET /jsonp", () => {
  it("returns application/javascript wrapping callback", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/jsonp?callback=myFn`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-type").includes("application/javascript"));
      const body = await res.text();
      assert.ok(body.startsWith("myFn("), `expected myFn( prefix, got: ${body.slice(0, 30)}`);
      assert.ok(body.endsWith(");"), "expected ); suffix");
    });
  });

  it("strips non-identifier characters from callback name", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/jsonp?callback=alert(1)`);
      const body = await res.text();
      assert.ok(!body.includes("(1)"), "should not include injected characters");
    });
  });
});

// ── POST /beacon ──────────────────────────────────────────────────────────────
describe("POST /beacon", () => {
  it("returns 204 No Content", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/beacon`, {
        method: "POST",
        body: JSON.stringify({ ts: Date.now() }),
        headers: { "Content-Type": "application/json" },
      });
      assert.equal(res.status, 204);
      const body = await res.text();
      assert.equal(body, "");
    });
  });
});

// ── GET /pixel ────────────────────────────────────────────────────────────────
describe("GET /pixel", () => {
  it("returns a 1x1 GIF for img tracking pixels", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/pixel?ts=1&event=ping`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-type")?.includes("image/gif"));
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf[0], 0x47); // G
      assert.equal(buf[1], 0x49); // I
      assert.equal(buf[2], 0x46); // F
      assert.ok(buf.length >= 35 && buf.length <= 50);
    });
  });
});

describe("GET /capabilities", () => {
  it("reports webTransport and http2Push as unavailable on this server", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/capabilities`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.webTransport.availableOnThisServer, false);
      assert.equal(data.http2Push.browserSupport, "removed");
    });
  });
});

describe("GET /h2-push", () => {
  it("returns Link preload hint and push:false", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/h2-push`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("link")?.includes("rel=preload"));
      const data = await res.json();
      assert.equal(data.push, false);
    });
  });
});

describe("GET /iframe-stream", () => {
  it("streams HTML script tags that invoke parent callback", async () => {
    await withServer(async (base) => {
      const res = await fetch(
        `${base}/api/demo/compare/iframe-stream?delay=0&callback=onDemo`,
      );
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-type")?.includes("text/html"));
      const html = await res.text();
      assert.ok(html.includes("<script>"));
      assert.ok(html.includes("parent.onDemo"));
      assert.ok(html.includes('"done"'));
      const scriptCount = (html.match(/<script>/g) || []).length;
      assert.ok(scriptCount >= 10, `expected many script chunks, got ${scriptCount}`);
    });
  });
});

describe("GET /stream?design=1", () => {
  it("starts with a whitespace prelude then newline-framed words", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/demo/compare/stream?delay=0&design=1`);
      const text = await res.text();
      assert.ok(text.startsWith(" ".repeat(100)), "should begin with prelude spaces");
      const afterPrelude = text.replace(/^\s+\n/, "");
      const lines = afterPrelude.trim().split("\n").filter(Boolean);
      assert.ok(lines.length >= 10, `expected framed words, got ${lines.length}`);
    });
  });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
describe("WebSocket /api/demo/compare/ws", () => {
  it("completes handshake, receives words, then closes", async () => {
    await withServer(async (_base, port) => {
      const messages = [];
      await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const key = crypto.randomBytes(16).toString("base64");
        const acceptExpected = crypto
          .createHash("sha1")
          .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
          .digest("base64");

        socket.connect(port, "127.0.0.1", () => {
          socket.write(
            "GET /api/demo/compare/ws HTTP/1.1\r\n" +
              `Host: 127.0.0.1:${port}\r\n` +
              "Upgrade: websocket\r\n" +
              "Connection: Upgrade\r\n" +
              `Sec-WebSocket-Key: ${key}\r\n` +
              "Sec-WebSocket-Version: 13\r\n" +
              "\r\n",
          );
        });

        let buf = Buffer.alloc(0);
        let upgraded = false;

        socket.on("data", (chunk) => {
          buf = Buffer.concat([buf, chunk]);

          if (!upgraded) {
            const headerEnd = buf.indexOf("\r\n\r\n");
            if (headerEnd === -1) return;
            const header = buf.slice(0, headerEnd).toString();
            assert.ok(header.includes("101 Switching Protocols"));
            assert.ok(header.includes(acceptExpected), "Sec-WebSocket-Accept mismatch");
            upgraded = true;
            buf = buf.slice(headerEnd + 4);

            // Send a masked text frame: "start"
            const payload = Buffer.from("start", "utf8");
            const mask = crypto.randomBytes(4);
            const frame = Buffer.alloc(2 + 4 + payload.length);
            frame[0] = 0x81;
            frame[1] = 0x80 | payload.length;
            mask.copy(frame, 2);
            for (let i = 0; i < payload.length; i++) {
              frame[6 + i] = payload[i] ^ mask[i % 4];
            }
            socket.write(frame);
          }

          // Parse incoming frames
          while (buf.length >= 2) {
            const opcode = buf[0] & 0x0f;
            let payloadLen = buf[1] & 0x7f;
            let offset = 2;
            if (payloadLen === 126) {
              if (buf.length < 4) break;
              payloadLen = buf.readUInt16BE(2);
              offset = 4;
            }
            if (buf.length < offset + payloadLen) break;
            const data = buf.slice(offset, offset + payloadLen);
            buf = buf.slice(offset + payloadLen);

            if (opcode === 0x8) {
              socket.destroy();
              resolve();
              return;
            }
            if (opcode === 0x1) {
              messages.push(data.toString("utf8"));
            }
          }
        });

        socket.on("error", reject);
        socket.on("close", () => resolve());
        // timeout safety
        setTimeout(() => { socket.destroy(); resolve(); }, 10000);
      });

      assert.ok(messages.length > 0, "should receive at least one word");
    });
  });
});

// ── LLM source switch ─────────────────────────────────────────────────────────
describe("LLM source switch", () => {
  it("GET /once with X-Source: llm and no key returns 503", async () => {
    await withServer(
      async (base) => {
        const res = await fetch(`${base}/api/demo/compare/once`, {
          headers: { "X-Source": "llm" },
        });
        assert.equal(res.status, 503);
        const data = await res.json();
        assert.equal(data.error, "llm_not_configured");
      },
      { env: {} },
    );
  });

  it("GET /once with X-Source: llm proxies fake DashScope and sets source=llm", async () => {
    await withServer(
      async (base) => {
        const res = await fetch(`${base}/api/demo/compare/once`, {
          headers: { "X-Source": "llm" },
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.source, "llm");
        assert.equal(data.text, "前端 流式");
      },
      {
        env: { DASHSCOPE_API_KEY: "test-key" },
        fetchImpl: fakeDashScopeFetch(["前端", " ", "流式"]),
      },
    );
  });

  it("GET /stream?source=llm streams tokens as plain text", async () => {
    await withServer(
      async (base) => {
        const res = await fetch(
          `${base}/api/demo/compare/stream?delay=0&source=llm`,
        );
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("x-source"), "llm");
        const text = await res.text();
        assert.equal(text, "AB");
      },
      {
        env: { DASHSCOPE_API_KEY: "test-key" },
        fetchImpl: fakeDashScopeFetch(["A", "B"]),
      },
    );
  });

  it("GET /sse?source=llm emits token events then [DONE]", async () => {
    await withServer(
      async (base) => {
        const res = await fetch(`${base}/api/demo/compare/sse?delay=0&source=llm`);
        assert.equal(res.status, 200);
        const raw = await res.text();
        assert.ok(raw.includes('"word":"你好"'));
        assert.ok(raw.includes("data: [DONE]"));
      },
      {
        env: { DASHSCOPE_API_KEY: "test-key" },
        fetchImpl: fakeDashScopeFetch(["你好"]),
      },
    );
  });

  it("GET /capabilities reports llm.configured", async () => {
    await withServer(
      async (base) => {
        const res = await fetch(`${base}/api/demo/compare/capabilities`);
        const data = await res.json();
        assert.equal(data.llm.configured, true);
        assert.ok(Array.isArray(data.llm.appliesTo));
      },
      { env: { DASHSCOPE_API_KEY: "present" } },
    );
  });
});
