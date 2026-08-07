/**
 * login-proxy.test.ts — E14 HTTP 登录代理（mock fetch，不依赖真实 api2）
 * ===========================================================================
 * 覆盖：
 *   - extractSessionToken：单条/数组 set-cookie 提取、URL 编码、缺失。
 *   - proxyLogin：转发 api2 sign-in/email（POST + JSON body + content-type）、
 *     set-cookie 提取 sessionToken、api2 不可达 → API2_UNREACHABLE、
 *     4xx → INVALID_CREDENTIALS、5xx → SERVER_ERROR、缺参 → BAD_REQUEST、
 *     register 模式 → sign-up/email。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { proxyLogin, extractSessionToken } from "../src/login-proxy.ts";

// ── extractSessionToken 纯函数 ──
test("extractSessionToken: 单条 set-cookie 提取 session_token", () => {
  const raw =
    "better-auth.session_token=tok_abc123; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600";
  assert.equal(extractSessionToken(raw), "tok_abc123");
});

test("extractSessionToken: 数组（Node undici getSetCookie 多行）取第一条命中", () => {
  const raw = [
    "theme=dark; Path=/",
    "better-auth.session_token=tok_array; Path=/; HttpOnly",
    "other=1; Path=/",
  ];
  assert.equal(extractSessionToken(raw), "tok_array");
});

test("extractSessionToken: 缺失 / 空值 → null", () => {
  assert.equal(extractSessionToken(null), null);
  assert.equal(extractSessionToken(undefined), null);
  assert.equal(extractSessionToken("theme=dark; Path=/"), null);
  assert.equal(extractSessionToken("better-auth.session_token=; Path=/"), null);
});

test("extractSessionToken: URL 编码值解码", () => {
  const raw = "better-auth.session_token=tok%2Fwith%2Fslash; Path=/";
  assert.equal(extractSessionToken(raw), "tok/with/slash");
});

// ── proxyLogin（mock fetch）──

/** 构造 mock fetch：handler 返回 { status, setCookie }，记录每次调用。 */
function mockFetch(
  handler: (url: string, init: RequestInit | undefined) => { status: number; setCookie?: string | string[] },
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, init });
    const r = handler(url, init);
    const headers = new Map<string, string>();
    if (r.setCookie !== undefined) headers.set("set-cookie", Array.isArray(r.setCookie) ? r.setCookie.join(", ") : r.setCookie);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: {
        get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        getSetCookie: () => (Array.isArray(r.setCookie) ? r.setCookie : r.setCookie ? [r.setCookie] : []),
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test("proxyLogin: 转发 api2 sign-in/email（POST + JSON body + content-type）并提取 sessionToken", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({
    status: 200,
    setCookie: "better-auth.session_token=tok_ok; Path=/; HttpOnly; SameSite=Lax",
  }));
  const r = await proxyLogin("player@example.com", "s3cret", {}, { fetchImpl });
  assert.deepEqual(r, { ok: true, sessionToken: "tok_ok" });

  assert.equal(calls.length, 1, "exactly one api2 call");
  assert.ok(calls[0].url.endsWith("/api/auth/sign-in/email"), `forward to sign-in/email, got ${calls[0].url}`);
  assert.equal(calls[0].init?.method, "POST");
  const hdrs = calls[0].init?.headers as Record<string, string>;
  assert.equal(hdrs["content-type"], "application/json");
  // E14：Node fetch 自动带 sec-fetch-mode:cors → api2 强制 Origin 校验；必须发 api2 信任的 Origin。
  assert.ok(hdrs.origin && hdrs.origin.length > 0, "forwards a trusted Origin header (Better Auth CSRF)");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(body, { email: "player@example.com", password: "s3cret" });
});

test("proxyLogin: api2 不可达 → API2_UNREACHABLE", async () => {
  const { fetchImpl, calls } = mockFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  const r = await proxyLogin("a@b.c", "pw", {}, { fetchImpl });
  assert.deepEqual(r, { ok: false, error: "API2_UNREACHABLE" });
  assert.equal(calls.length, 1, "single attempt");
});

test("proxyLogin: 4xx 认证失败 → INVALID_CREDENTIALS", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({ status: 401 }));
  const r = await proxyLogin("a@b.c", "wrong", {}, { fetchImpl });
  assert.deepEqual(r, { ok: false, error: "INVALID_CREDENTIALS" });
  assert.equal(calls.length, 1);
});

test("proxyLogin: 5xx → SERVER_ERROR", async () => {
  const { fetchImpl } = mockFetch(() => ({ status: 500 }));
  const r = await proxyLogin("a@b.c", "pw", {}, { fetchImpl });
  assert.deepEqual(r, { ok: false, error: "SERVER_ERROR" });
});

test("proxyLogin: 2xx 但无 session_token（异常）→ SERVER_ERROR", async () => {
  const { fetchImpl } = mockFetch(() => ({ status: 200, setCookie: "theme=dark" }));
  const r = await proxyLogin("a@b.c", "pw", {}, { fetchImpl });
  assert.deepEqual(r, { ok: false, error: "SERVER_ERROR" });
});

test("proxyLogin: 缺 email/password → BAD_REQUEST（不发网络）", async () => {
  let called = false;
  const { fetchImpl } = mockFetch(() => {
    called = true;
    return { status: 200, setCookie: "better-auth.session_token=x" };
  });
  const r1 = await proxyLogin("", "pw", {}, { fetchImpl });
  const r2 = await proxyLogin("a@b.c", "", {}, { fetchImpl });
  assert.deepEqual(r1, { ok: false, error: "BAD_REQUEST" });
  assert.deepEqual(r2, { ok: false, error: "BAD_REQUEST" });
  assert.equal(called, false, "no network call when body invalid");
});

test("proxyLogin: register 模式 → 转发 sign-up/email 并提取 token（加分项）", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({
    status: 200,
    setCookie: ["other=1; Path=/", "better-auth.session_token=tok_reg; Path=/; HttpOnly"],
  }));
  const r = await proxyLogin("new@example.com", "pw", { mode: "register" }, { fetchImpl });
  assert.deepEqual(r, { ok: true, sessionToken: "tok_reg" });
  assert.ok(calls[0].url.endsWith("/api/auth/sign-up/email"), `forward to sign-up/email, got ${calls[0].url}`);
});

test("proxyLogin: register 4xx（邀请码缺失/注册被拒）→ INVALID_CREDENTIALS", async () => {
  const { fetchImpl } = mockFetch(() => ({ status: 400 }));
  const r = await proxyLogin("new@example.com", "pw", { mode: "register" }, { fetchImpl });
  assert.deepEqual(r, { ok: false, error: "INVALID_CREDENTIALS" });
});
