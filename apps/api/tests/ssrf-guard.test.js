"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { assertSafeUrl, isPrivateIp, SsrfError } = require("../src/lib/ssrf-guard");

describe("ssrf-guard isPrivateIp", () => {
  it("flags loopback / private / link-local IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.5.5",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
    ]) {
      assert.equal(isPrivateIp(ip), true, `${ip} should be private`);
    }
  });

  it("allows public IPv4", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "93.184.216.34"]) {
      assert.equal(isPrivateIp(ip), false, `${ip} should be public`);
    }
  });

  it("flags loopback / ULA / link-local IPv6", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12::34", "::ffff:127.0.0.1"]) {
      assert.equal(isPrivateIp(ip), true, `${ip} should be private`);
    }
  });

  it("refuses non-IP strings", () => {
    assert.equal(isPrivateIp("not-an-ip"), true);
  });
});

describe("ssrf-guard assertSafeUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await assert.rejects(() => assertSafeUrl("file:///etc/passwd"), SsrfError);
    await assert.rejects(() => assertSafeUrl("gopher://x/"), SsrfError);
  });

  it("rejects empty / malformed input", async () => {
    await assert.rejects(() => assertSafeUrl(""), SsrfError);
    await assert.rejects(() => assertSafeUrl("http://"), SsrfError);
  });

  it("rejects private / metadata IP literals", async () => {
    await assert.rejects(() => assertSafeUrl("http://169.254.169.254/latest/meta-data/"), SsrfError);
    await assert.rejects(() => assertSafeUrl("http://127.0.0.1:22/"), SsrfError);
    await assert.rejects(() => assertSafeUrl("http://[::1]/"), SsrfError);
    await assert.rejects(() => assertSafeUrl("https://10.0.0.5/admin"), SsrfError);
  });

  it("accepts a public IP literal without DNS", async () => {
    const url = await assertSafeUrl("https://1.1.1.1/path?x=1");
    assert.equal(url.hostname, "1.1.1.1");
    assert.equal(url.protocol, "https:");
  });
});
