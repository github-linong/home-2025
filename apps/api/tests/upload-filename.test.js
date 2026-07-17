"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildStoredName, safeExtension } = require("../src/lib/multer-upload");

describe("multer stored filename hardening", () => {
  it("never contains path separators or traversal for hostile names", () => {
    const hostile = [
      "../../../../var/www/html/shell.php",
      "..\\..\\windows\\system32\\evil.bat",
      "/etc/passwd",
      "foo/../../bar.png",
      "a".repeat(500) + ".png",
      "no-extension",
      "weird\u0000name.png",
    ];
    for (const originalname of hostile) {
      const name = buildStoredName({ originalname, mimetype: "application/octet-stream" });
      assert.ok(!name.includes("/"), `no slash in ${name}`);
      assert.ok(!name.includes("\\"), `no backslash in ${name}`);
      assert.ok(!name.includes(".."), `no dotdot in ${name}`);
      assert.match(name, /^\d+-[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/);
    }
  });

  it("preserves a safe extension from the client name", () => {
    assert.equal(safeExtension({ originalname: "photo.PNG", mimetype: "image/png" }), ".png");
    assert.equal(safeExtension({ originalname: "../x/clip.MP4", mimetype: "video/mp4" }), ".mp4");
  });

  it("falls back to mimetype extension when name has none", () => {
    assert.equal(safeExtension({ originalname: "voice", mimetype: "audio/wav" }), ".wav");
    assert.equal(safeExtension({ originalname: "voice", mimetype: "audio/ogg" }), ".ogg");
  });

  it("drops unknown / dangerous pseudo-extensions", () => {
    assert.equal(safeExtension({ originalname: "x.", mimetype: "application/octet-stream" }), "");
    assert.equal(
      safeExtension({ originalname: "x.php.", mimetype: "application/octet-stream" }),
      ""
    );
  });
});
