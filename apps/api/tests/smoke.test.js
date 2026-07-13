"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.API_PORT = "0";
process.env.BAIDU_CLIENT_ID = "";
process.env.BAIDU_CLIENT_SECRET = "";
process.env.WX_APPID = "";
process.env.WX_APP_SECRET = "";

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
            ? {
                "Content-Type": "application/json",
                "Content-Length": payload.length,
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("legacy api smoke", () => {
  let server;

  before(() => {
    const app = createApp();
    server = app.listen(0);
  });

  after(() => {
    server.close();
  });

  it("GET /api/health", async () => {
    const res = await request(server, "GET", "/api/health");
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).ok, true);
  });

  it("POST /post echoes body", async () => {
    const res = await request(server, "POST", "/post?x=1", {
      body: JSON.stringify({ hello: "world" }),
    });
    assert.equal(res.status, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.state, 1000);
    assert.equal(json.body.hello, "world");
    assert.equal(json.query.x, "1");
  });

  it("CORS demo reflects origin", async () => {
    const res = await request(server, "GET", "/CORS/lnong?a=1", {
      headers: { Origin: "https://example.com" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers["access-control-allow-origin"], "https://example.com");
    const json = JSON.parse(res.body);
    assert.equal(json.state, 1000);
    assert.equal(json.method, "GET");
    assert.ok(json.timezone);
  });

  it("corsutils sleep returns custom body", async () => {
    const res = await request(
      server,
      "GET",
      "/corsutils/sleep?responseData=ok&responseStatus=201"
    );
    assert.equal(res.status, 201);
    assert.equal(res.body, "ok");
  });

  it("vapi hex2utf8", async () => {
    const hex = Buffer.from("hello").toString("hex");
    const res = await request(server, "GET", `/vapi/hex2utf8?searchValue=${hex}`);
    assert.equal(res.status, 200);
    assert.equal(res.body, "hello");
  });

  it("vapi fallback *", async () => {
    const res = await request(server, "GET", "/vapi/unknown-path");
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), { state: 1000, message: "*" });
  });

  it("deprecated paths keep message", async () => {
    const res = await request(server, "GET", "/element/foo");
    assert.equal(res.status, 200);
    assert.match(res.body, /当前路径废弃/);
  });

  it("POST /api/unknown returns /api/*", async () => {
    const res = await request(server, "POST", "/api/not-a-real-tag", {
      body: "{}",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, "/api/*");
  });
});
