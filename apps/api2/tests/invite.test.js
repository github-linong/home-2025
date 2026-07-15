import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseInviteCodes, validateInviteCode } from "../src/invite.js";

describe("parseInviteCodes", () => {
  it("splits and trims AUTH_INVITE_CODES", () => {
    const codes = parseInviteCodes({ AUTH_INVITE_CODES: " a ,b,  c " });
    assert.equal(codes.size, 3);
    assert.ok(codes.has("a"));
    assert.ok(codes.has("b"));
    assert.ok(codes.has("c"));
  });

  it("falls back to AUTH_INVITE_CODE", () => {
    const codes = parseInviteCodes({ AUTH_INVITE_CODE: "solo" });
    assert.deepEqual([...codes], ["solo"]);
  });
});

describe("validateInviteCode", () => {
  it("rejects when no codes configured", () => {
    assert.equal(validateInviteCode("x", new Set()).reason, "missing_config");
  });

  it("rejects wrong or empty code", () => {
    const codes = new Set(["ok"]);
    assert.equal(validateInviteCode("", codes).reason, "invalid");
    assert.equal(validateInviteCode("nope", codes).reason, "invalid");
  });

  it("accepts a matching code", () => {
    assert.equal(validateInviteCode(" ok ", new Set(["ok"])).ok, true);
  });
});
