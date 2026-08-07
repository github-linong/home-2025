/**
 * auth-token.test.ts — E14 verifyWithApi2 token 模式（生产路径，devSkipAuth=false）
 * ===========================================================================
 * 覆盖：
 *   - ?sessionToken= 模式：调 api2 /api/me 时带 `Cookie: better-auth.session_token=<token>` 头。
 *   - /api/me authenticated → { userId, guest:false }（登录）。
 *   - /api/me 未认证 → 游客（降级，零门槛）。
 *   - api2 不可达 → 游客（降级，不丢连接）。
 *   - token 为空时回退 cookie 头（原双模式行为不变）。
 *
 * 必须在静态 import 之前关闭 devSkipAuth，使 config 在本文件独占进程内重新求值。
 * 用动态 import 保证 config 在 env 设置后才被求值（与 auth-verify-production.test.ts 同模式）。
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.DEV_SKIP_AUTH = "false";

const { verifyWithApi2 } = await import("../src/auth.ts");

/** mock fetch：记录 url + Cookie 头，返回 handler 指定结果。 */
function mockFetch(
  handler: (url: string, cookieHeader: string | undefined) => { ok: boolean; json: () => unknown },
) {
  const calls: { url: string; cookieHeader: string | undefined }[] = [];
  const fetchImpl = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = typeof input === "string" ? input : String(input);
    const cookieHeader = init?.headers?.cookie;
    calls.push({ url, cookieHeader });
    return handler(url, cookieHeader);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test("token 模式: /api/me 带 Cookie: better-auth.session_token=<token> 且 authenticated → 登录", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({
    ok: true,
    json: async () => ({ authenticated: true, user: { id: "gh_456" } }),
  }));
  const r = await verifyWithApi2("", { token: "tok_xyz" }, { fetchImpl });
  assert.equal(r?.guest, false);
  assert.equal(r?.userId, "gh_456");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/api/me"), "only hits /api/me");
  assert.equal(
    calls[0].cookieHeader,
    "better-auth.session_token=tok_xyz",
    "token mode sends Cookie header with session_token",
  );
});

test("token 模式: /api/me 未认证 → 游客降级（不拒绝连接）", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({
    ok: true,
    json: async () => ({ authenticated: false, user: null }),
  }));
  const r = await verifyWithApi2("", { token: "tok_expired" }, { fetchImpl });
  assert.equal(r?.guest, true);
  assert.match(r!.userId, /^guest_/, "server-issued guestId");
  assert.equal(calls[0].cookieHeader, "better-auth.session_token=tok_expired");
});

test("token 模式: api2 不可达 → 游客降级", async () => {
  const { fetchImpl, calls } = mockFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  const r = await verifyWithApi2("", { token: "tok_x" }, { fetchImpl });
  assert.equal(r?.guest, true);
  assert.equal(calls.length, 1);
});

test("token 为空 → 回退 cookie 头（原双模式不变）", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({
    ok: true,
    json: async () => ({ authenticated: true, user: { id: "gh_cookie" } }),
  }));
  const r = await verifyWithApi2("better-auth.session_token=from_cookie; other=1", { token: "" }, { fetchImpl });
  assert.equal(r?.guest, false);
  assert.equal(r?.userId, "gh_cookie");
  assert.equal(
    calls[0].cookieHeader,
    "better-auth.session_token=from_cookie; other=1",
    "empty token → pass through original cookie header",
  );
});

test("token 模式: 永不调用密码/登录端点（C-Per-2）", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({
    ok: true,
    json: async () => ({ authenticated: false, user: null }),
  }));
  await verifyWithApi2("", { token: "tok_any" }, { fetchImpl });
  assert.ok(
    calls.every((c) => c.url.endsWith("/api/me")),
    "verifyWithApi2 only ever hits /api/me, never sign-in/password endpoints",
  );
});
