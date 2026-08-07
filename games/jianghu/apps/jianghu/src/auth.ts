/**
 * auth.ts — 鉴权钩子（E2 · 真实 Better Auth verifyWithApi2 + 双模式）
 * ===========================================================================
 * 复用参照：apps/chat/src/auth/session.js 的 verifyWithApi2 模型 + apps/api2/src/server.js
 * 的 `/api/me` 接口（Better Auth 真实鉴权）。
 *
 * 双模式（ADR-JH-ENG-02 §1）：
 *   - 登录玩家：cookie 经 api2 `/api/me` 校验 → 返回 { userId, guest:false }。
 *   - 游客：无有效会话 → 服务端随机 guestId（crypto.randomUUID，C-Per-2），零持久写。
 *
 * 注入点：
 *   - `deps.verify`：gateway 层注入自定义校验（便于测试 / 未来替换鉴权后端）。
 *   - `deps.fetchImpl`：verifyWithApi2 内部注入 fetch（测试用 mock，避免依赖真实 api2）。
 *
 * 安全纪律（C-Per-2）：本模块**只**调用 api2 的 `/api/me`（只读会话校验），
 *   绝不暴露 / 调用任何密码 / 登录 / 注册接口；游客模式不读取也不写入持久库。
 */

import { config } from "./config.ts";
import { generateGuestId } from "./ids.ts";

export interface VerifiedIdentity {
  readonly userId: string;
  readonly guest: boolean;
}

export type VerifyFn = (
  cookie: string,
  opts: { devUserId?: string | null },
) => Promise<VerifiedIdentity | null>;

export interface VerifyDeps {
  /** 测试注入：替换全局 fetch（默认 globalThis.fetch）。 */
  fetchImpl?: typeof fetch;
}

/**
 * 真实 Better Auth 校验（复用 api2 `/api/me`，镜像 apps/chat）。
 *
 * @param cookie 浏览器 ws 握手带入的 Cookie 头（含 better-auth session token）。
 * @param opts.devUserId 开发态身份注入（?devUserId=）；仅 devSkipAuth 下生效。
 * @returns
 *   - devSkipAuth + devUserId → { userId: devUserId, guest:false }（开发登录）
 *   - devSkipAuth + 无 devUserId → 游客 { userId: guest_*, guest:true }
 *   - 生产 + /api/me 已登录 → { userId: user.id, guest:false }
 *   - 生产 + 未登录 / api2 不可达 → 游客 { userId: guest_*, guest:true }（降级，零门槛）
 *   永不返回需要密码的失败；游客是合法兜底（P5 即开即玩）。
 */
export async function verifyWithApi2(
  cookie: string,
  opts: { devUserId?: string | null },
  deps: VerifyDeps = {},
): Promise<VerifiedIdentity | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  // 开发态：跳过真实鉴权，用 devUserId 注入登录身份（无 devUserId 则按游客处理）。
  if (config.devSkipAuth) {
    const devUserId = opts.devUserId && opts.devUserId.length > 0 ? opts.devUserId : null;
    if (devUserId) return { userId: devUserId, guest: false };
    return { userId: generateGuestId(), guest: true };
  }

  // 生产态：调用 api2 `/api/me` 校验 better-auth 会话（与 apps/chat 同契约）。
  try {
    const res = await fetchImpl(`${config.api2BaseUrl}/api/me`, {
      headers: cookie ? { cookie } : {},
    });
    if (res.ok) {
      const data = (await res.json()) as {
        authenticated?: boolean;
        user?: { id?: string } | null;
      };
      if (data.authenticated && data.user?.id) {
        return { userId: data.user.id, guest: false };
      }
    }
  } catch {
    // api2 不可达 → 降级游客（ADR §7：DB 不可用降级游客，不丢 token、不拒绝连接）。
  }

  // 未登录 / api2 异常 → 游客兜底（服务端随机 guestId，零持久写）。
  return { userId: generateGuestId(), guest: true };
}
