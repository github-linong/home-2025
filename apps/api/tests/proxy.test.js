"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.API_PORT = "0";

const { createApp } = require("../src/app");

function request(server, method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body == null ? null : Buffer.from(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: addr.port,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": payload.length }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("proxy hardening (SSRF only, no auth)", () => {
  let server;
  before(() => {
    server = createApp().listen(0);
  });
  after(() => server.close());

  it("rejects loopback target", async () => {
    const res = await request(server, "GET", "/proxy?url=http://127.0.0.1:22/");
    assert.equal(res.status, 400);
  });

  it("rejects cloud metadata target", async () => {
    const res = await request(
      server,
      "GET",
      "/proxy?url=http://169.254.169.254/latest/meta-data/"
    );
    assert.equal(res.status, 400);
  });

  it("rejects non-http protocol", async () => {
    const res = await request(server, "GET", "/proxy?url=file:///etc/passwd");
    assert.equal(res.status, 400);
  });

  it("rejects missing url on POST", async () => {
    const res = await request(server, "POST", "/proxy", {
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it("rejects private LAN target", async () => {
    const res = await request(server, "GET", "/proxy?url=http://192.168.1.1/");
    assert.equal(res.status, 400);
  });
});
