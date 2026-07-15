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
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("content-views slug validation", () => {
  let server;

  before(() => {
    const app = createApp();
    server = app.listen(0);
  });

  after(() => {
    server.close();
  });

  it("accepts Chinese demo slugs", async () => {
    const res = await request(server, "POST", "/api/content-views", {
      body: JSON.stringify({ type: "demo", slug: "架构图编辑器" }),
    });
    assert.equal(res.status, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
    assert.equal(json.key, "demo:架构图编辑器");
    assert.ok(json.views >= 1);
  });

  it("rejects path-like slugs", async () => {
    const res = await request(server, "POST", "/api/content-views", {
      body: JSON.stringify({ type: "demo", slug: "../evil" }),
    });
    assert.equal(res.status, 400);
  });

  it("rejects empty slug", async () => {
    const res = await request(server, "POST", "/api/content-views", {
      body: JSON.stringify({ type: "blog", slug: "" }),
    });
    assert.equal(res.status, 400);
  });
});
