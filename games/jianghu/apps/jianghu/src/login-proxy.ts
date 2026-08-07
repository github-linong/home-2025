/**
 * login-proxy.ts — HTTP 登录/注册代理（E14 · 真实登录接入）
 * ===========================================================================
 * 服务端 :3011 提供 `POST /api/auth/login` / `POST /api/auth/register`，把
 * 邮箱+密码转发给 api2 Better Auth，并把回包 set-cookie 里的
 * `better-auth.session_token` 提取出来交给客户端（客户端再以 ?sessionToken= 重连 ws）。
 *
 * 为什么要走服务端代理（而不是客户端直连 api2）：
 *   - 客户端只暴露会话 token，绝不直接接触 Better Auth 密码端点（C-Per-2 镜像）。
 *   - 跨域 / CORS / trustedOrigins 统一收敛到服务端，客户端零凭证处理。
 *
 * 安全纪律（C-Per-2）：本模块是**唯一**接触密码端点的地方，且仅经服务端 :3011 HTTP 入口；
 *   verifyWithApi2（auth.ts）永不调用本模块，职责严格分离。
 *
 * 注入点：`deps.fetchImpl` 供测试 mock（避免依赖真实 api2）。
 */

import { config } from "./config.ts";

/** E14 错误码：api2 不可达 / 认证失败（错密码、未注册、注册被拒）/ 请求体非法 / api2 5xx。 */
export type LoginError =
  | "API2_UNREACHABLE"
  | "INVALID_CREDENTIALS"
  | "BAD_REQUEST"
  | "SERVER_ERROR";

export type LoginResult =
  | { ok: true; sessionToken: string }
  | { ok: false; error: LoginError };

export interface LoginProxyDeps {
  /** 测试注入：替换全局 fetch（默认 globalThis.fetch）。 */
  fetchImpl?: typeof fetch;
}

/** Better Auth 会话 cookie 名（与 auth.ts SESSION_COOKIE_NAME 同名，单一来源）。 */
export const SESSION_COOKIE_NAME = "better-auth.session_token";

/**
 * 从 set-cookie 头（单条字符串或数组）提取 better-auth.session_token 值。
 * set-cookie 形如：
 *   `better-auth.session_token=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=...`
 * 多个 cookie 用 `;` 分隔，多行 set-cookie 用数组承载（Node undici getSetCookie()）。
 */
export function extractSessionToken(
  setCookie: string | readonly string[] | null | undefined,
): string | null {
  if (!setCookie) return null;
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const header of headers) {
    for (const part of header.split(";")) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      if (trimmed.slice(0, eq) !== SESSION_COOKIE_NAME) continue;
      const val = trimmed.slice(eq + 1);
      if (!val) return null;
      try {
        return decodeURIComponent(val);
      } catch {
        return val; // 非 URL 编码也返回原值（宽松解析）
      }
    }
  }
  return null;
}

/** 最小响应头接口：兼容 Node undici Headers（getSetCookie 存在时优先）+ 老式 get('set-cookie')。 */
interface CookieHeaders {
  get?(name: string): string | null;
  getSetCookie?(): string[];
}

function extractTokenFromResponse(res: { headers: CookieHeaders }): string | null {
  const h = res.headers;
  if (typeof h.getSetCookie === "function") {
    const cookies = h.getSetCookie();
    if (cookies.length > 0) {
      const token = extractSessionToken(cookies);
      if (token) return token;
    }
  }
  if (typeof h.get === "function") {
    const joined = h.get("set-cookie");
    if (joined) {
      const token = extractSessionToken(joined);
      if (token) return token;
    }
  }
  return null;
}

/**
 * 转发登录/注册到 api2 Better Auth，提取 better-auth.session_token。
 *
 * @param email    邮箱（trim 后校验非空）。
 * @param password 密码（非空校验）。
 * @param opts.mode "login"（默认，sign-in/email）| "register"（sign-up/email，加分项）。
 * @returns
 *   - 2xx + set-cookie 含 session_token → { ok:true, sessionToken }。
 *   - 2xx 但无 session_token（异常）→ { ok:false, error:"SERVER_ERROR" }。
 *   - api2 网络不可达 / 抛错 → { ok:false, error:"API2_UNREACHABLE" }。
 *   - api2 4xx（错密码 / 未注册 / 邀请码缺失 / 注册被拒）→ { ok:false, error:"INVALID_CREDENTIALS" }。
 *   - api2 5xx → { ok:false, error:"SERVER_ERROR" }。
 *   - 请求体缺 email/password → { ok:false, error:"BAD_REQUEST" }（不发网络）。
 */
export async function proxyLogin(
  email: string,
  password: string,
  opts: { mode?: "login" | "register" } = {},
  deps: LoginProxyDeps = {},
): Promise<LoginResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const endpoint = opts.mode === "register" ? "sign-up/email" : "sign-in/email";
  const url = `${config.api2BaseUrl}/api/auth/${endpoint}`;

  if (!email || !password) return { ok: false, error: "BAD_REQUEST" };

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Better Auth CSRF：Node fetch 自动带 sec-fetch-mode:cors → api2 强制 Origin 校验。
        // 值必须命中 api2 的 trustedOrigins（config.api2Origin，见 ADR-E14 说明）。
        origin: config.api2Origin,
      },
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch {
    return { ok: false, error: "API2_UNREACHABLE" };
  }

  if (res.ok) {
    const sessionToken = extractTokenFromResponse(res);
    if (sessionToken) return { ok: true, sessionToken };
    return { ok: false, error: "SERVER_ERROR" };
  }

  // 4xx → 认证失败（错密码 / 未注册 / 注册被拒）；5xx → api2 内部错误。
  return { ok: false, error: res.status >= 500 ? "SERVER_ERROR" : "INVALID_CREDENTIALS" };
}
