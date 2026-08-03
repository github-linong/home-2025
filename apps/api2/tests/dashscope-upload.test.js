import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mediaNeedsOssUpload,
  parseDataUrl,
  validateVideoMedia,
} from "../src/demo/dashscope-upload.js";

describe("dashscope-upload helpers", () => {
  it("parseDataUrl decodes image payload", () => {
    const png1x1 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const parsed = parseDataUrl(png1x1);
    assert.equal(parsed.mime, "image/png");
    assert.equal(parsed.ext, "png");
    assert.ok(parsed.buffer.length > 0);
  });

  it("mediaNeedsOssUpload flags video/audio data URLs", () => {
    assert.equal(mediaNeedsOssUpload("https://example.com/a.mp4"), false);
    assert.equal(mediaNeedsOssUpload("data:video/mp4;base64,AAAA"), true);
    assert.equal(mediaNeedsOssUpload("data:audio/mpeg;base64,AAAA"), true);
    assert.equal(
      mediaNeedsOssUpload(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      false,
    );
  });

  it("validateVideoMedia requires first frame for i2v", () => {
    const cfg = { type: "i2v", mediaStyle: "media", supportsLastFrame: true };
    assert.equal(validateVideoMedia(cfg, { imgUrl: null }), "图生视频需要上传首帧参考图");
    assert.equal(
      validateVideoMedia(cfg, { lastFrameUrl: "data:image/png;base64,x", imgUrl: null }),
      "图生视频需要上传首帧参考图",
    );
    assert.equal(validateVideoMedia(cfg, { imgUrl: "data:image/png;base64,x" }), null);
  });
});
