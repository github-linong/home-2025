/**
 * auth.ts — 会话鉴权（E1.S1.2，复用 poker auth/session.js verifyWithApi2）
 *
 * 复用参照（镜像算法，不跨仓 import）：
 *   apps/poker-realtime/src/auth/session.js
 *   - devSkipAuth：用 devUserId（query ?devUserId= 或 cookie dungeon_dev_uid）注入身份。
 *   - 生产：fetch `${api2BaseUrl}/api/me` 校验 cookie，返回 { userId, user }。
 */

import { config } from "./config.ts";
import { randomBytes } from "node:crypto";

export interface VerifiedIdentity {
  userId: string;
  user: { id: string; name: string; email?: string };
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const p = part.trim();
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    if (p.slice(0, eq) === name) {
      try {
        return decodeURIComponent(p.slice(eq + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function verifyWithApi2(
  cookieHeader: string,
  opts: { devUserId?: string | null } = {},
): Promise<VerifiedIdentity | null> {
  if (config.devSkipAuth) {
    const fromQuery = opts.devUserId?.trim();
    const fromCookie = parseCookie(cookieHeader, "dungeon_dev_uid");
    const devUserId =
      (fromQuery && /^[\w-]{2,64}$/.test(fromQuery) && fromQuery) ||
      (fromCookie && /^[\w-]{2,64}$/.test(fromCookie) && fromCookie) ||
      `dev_${randomBytes(4).toString("hex")}`;
    return {
      userId: devUserId,
      user: {
        id: devUserId,
        name: `Dev ${devUserId.slice(-4)}`,
        email: `${devUserId}@local.test`,
      },
    };
  }

  try {
    const res = await fetch(`${config.api2BaseUrl}/api/me`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { authenticated?: boolean; user?: { id?: string } };
    if (!data.authenticated || !data.user?.id) return null;
    return { userId: data.user.id, user: data.user as VerifiedIdentity["user"] };
  } catch {
    return null;
  }
}
