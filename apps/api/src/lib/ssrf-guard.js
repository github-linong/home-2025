"use strict";

const net = require("net");
const dns = require("dns").promises;

// Only these protocols may ever be proxied. Blocks file:, gopher:, ftp:, data:, etc.
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

class SsrfError extends Error {
  constructor(message) {
    super(message);
    this.name = "SsrfError";
    this.statusCode = 400;
  }
}

/** IPv4 dotted string → 32-bit unsigned integer. */
function ipv4ToInt(ip) {
  return ip
    .split(".")
    .reduce((acc, part) => (acc << 8) + (Number(part) & 0xff), 0) >>> 0;
}

function isPrivateIpv4(ip) {
  const n = ipv4ToInt(ip);
  const inRange = (base, mask) => (n & mask) === (ipv4ToInt(base) & mask);
  return (
    inRange("0.0.0.0", 0xff000000) || // 0.0.0.0/8 "this host"
    inRange("10.0.0.0", 0xff000000) || // private
    inRange("127.0.0.0", 0xff000000) || // loopback
    inRange("169.254.0.0", 0xffff0000) || // link-local (incl. 169.254.169.254 metadata)
    inRange("172.16.0.0", 0xfff00000) || // private
    inRange("192.168.0.0", 0xffff0000) || // private
    inRange("100.64.0.0", 0xffc00000) || // CGNAT
    inRange("192.0.0.0", 0xffffff00) || // IETF protocol assignments
    inRange("192.0.2.0", 0xffffff00) || // TEST-NET-1
    inRange("198.18.0.0", 0xfffe0000) || // benchmarking
    inRange("240.0.0.0", 0xf0000000) // reserved / broadcast
  );
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4.
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/** True when an IP literal points at a private / loopback / link-local host. */
function isPrivateIp(ip) {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) return isPrivateIpv6(ip);
  return true; // not a recognizable IP → refuse
}

/**
 * Validate a user-supplied URL for use as a proxy target.
 * - Enforces http/https only.
 * - Resolves the hostname and rejects if ANY resolved address is private,
 *   loopback, or link-local (blocks cloud metadata at 169.254.169.254).
 *
 * Note: this is a point-in-time check. A fully hardened proxy would pin the
 * validated IP for the actual connection to defeat DNS rebinding; callers here
 * additionally disable redirect following to shrink that window.
 *
 * @param {string} rawUrl
 * @returns {Promise<URL>}
 */
async function assertSafeUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new SsrfError("missing url");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("invalid url");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfError(`protocol not allowed: ${url.protocol}`);
  }

  const hostname = url.hostname;

  // Literal IP in the URL — check directly, no DNS.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new SsrfError("target address is not allowed");
    return url;
  }

  // Resolve the hostname and reject if any address is internal.
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new SsrfError("could not resolve host");
  }
  if (!addresses.length) throw new SsrfError("could not resolve host");
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new SsrfError("target resolves to a private address");
  }

  return url;
}

module.exports = { assertSafeUrl, isPrivateIp, SsrfError };
