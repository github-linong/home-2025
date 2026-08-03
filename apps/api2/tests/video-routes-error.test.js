import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatVideoError } from "../src/demo/video-routes.js";

describe("formatVideoError", () => {
  const algoErr = new Error(
    "Task failed: [InternalError.Algo] stat: path should be string, bytes, os.PathLike or integer, not NoneType",
  );

  it("maps algo NoneType with media to media guidance", () => {
    const out = formatVideoError(algoErr, { hadMedia: true, modelId: "wan2.7-i2v" });
    assert.match(out.message, /媒体文件格式/);
    assert.ok(out.detail?.includes("InternalError.Algo"));
  });

  it("maps algo NoneType without media on t2v-plus to model switch hint", () => {
    const out = formatVideoError(algoErr, { hadMedia: false, modelId: "wanx2.1-t2v-plus" });
    assert.match(out.message, /Turbo/);
    assert.match(out.message, /Wan 2\.7 T2V/);
    assert.ok(out.detail?.includes("InternalError.Algo"));
  });

  it("maps algo NoneType without media on other models to generic retry", () => {
    const out = formatVideoError(algoErr, { hadMedia: false, modelId: "wan2.7-t2v" });
    assert.match(out.message, /服务端处理失败/);
    assert.doesNotMatch(out.message, /媒体/);
  });

  it("passes through unrelated errors unchanged", () => {
    const out = formatVideoError(new Error("DashScope HTTP 429"), { hadMedia: false });
    assert.equal(out.message, "DashScope HTTP 429");
    assert.equal(out.detail, undefined);
  });
});
