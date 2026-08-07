/**
 * auth-verify-production.test.ts — 真实 Better Auth 校验（生产路径，devSkipAuth=false）
 * ===========================================================================
 * 必须在静态 import 之前关闭 devSkipAuth，使 config 在本文件独占进程内重新求值。
 * 用动态 import 保证 config 在 env 设置后才被求值。
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.DEV_SKIP_AUTH = "false";

const { verifyWithApi2 } = await import("../src/auth.ts");

function mockFetch(handler: (url: string) => { ok: boolean; json: () => unknown }) {
  const calls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as { href?: string }).href ?? String(input);
    calls.push(url);
    return handler(url);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test("production: valid better-auth session → login identity (guest:false)", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({
    ok: true,
    json: async () => ({ authenticated: true, user: { id: "gh_123" } }),
  }));
  const r = await verifyWithApi2("cookie=token", {}, { fetchImpl });
  assert.equal(r?.guest, false);
  assert.equal(r?.userId, "gh_123");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith("/api/me"), "only hits /api/me");
  assert.ok(
    !calls.some((c) => /password|sign-?in|login/i.test(c)),
    "C-Per-2: no password / sign-in endpoint is ever called",
  );
});

test("production: unauthenticated session → guest (zero-friction, server guestId)", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({
    ok: true,
    json: async () => ({ authenticated: false, user: null }),
  }));
  const r = await verifyWithApi2("cookie=expired", {}, { fetchImpl });
  assert.equal(r?.guest, true);
  assert.match(r!.userId, /^guest_/, "server-issued guestId (crypto.randomUUID)");
  assert.ok(calls.every((c) => c.endsWith("/api/me")));
});

test("production: api2 unreachable → degrade to guest (no reject, C-Per-2 safe)", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: unknown) => {
    calls.push(String(input));
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  const r = await verifyWithApi2("cookie=x", {}, { fetchImpl });
  assert.equal(r?.guest, true, "degrade to guest on api2 failure");
  assert.equal(calls.length, 1, "single /api/me attempt");
});
