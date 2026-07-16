import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { Pool } from "pg";
import { parseInviteCodes, validateInviteCode } from "./invite.js";

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.API2_DATABASE_URL ||
  "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL (or API2_DATABASE_URL) is required for api2");
}

/**
 * Aliyun CN → github.com/login/oauth/access_token is flaky (timeouts / RST).
 * Retry with a short abort so nginx does not sit on a 60s upstream hang.
 */
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.includes("github.com/login/oauth/access_token")) {
    return nativeFetch(input, init);
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      // Prefer a hard 8s ceiling; do not wait on flaky github.com sockets.
      const res = await nativeFetch(input, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      console.error(
        `[api2] github token exchange attempt ${attempt}/3 failed:`,
        err?.cause?.code || err?.name || err?.message || err,
      );
      if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastError;
};

export const pool = new Pool({
  connectionString: databaseUrl,
  // Tunnel to remote PG can flap; keep pool resilient.
  max: 5,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[api2] idle pg client error:", err.message || err);
});

const trustedOrigins = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ||
  "http://127.0.0.1:4321,http://localhost:4321,https://www.lilnong.top,https://lilnong.top"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const githubId = process.env.GITHUB_CLIENT_ID || "";
const githubSecret = process.env.GITHUB_CLIENT_SECRET || "";
const inviteCodes = parseInviteCodes();

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4321",
  trustedOrigins,
  emailAndPassword: {
    enabled: String(process.env.AUTH_EMAIL_PASSWORD || "").toLowerCase() === "true",
  },
  socialProviders: {
    ...(githubId && githubSecret
      ? {
          github: {
            clientId: githubId,
            clientSecret: githubSecret,
          },
        }
      : {}),
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const checked = validateInviteCode(ctx.body?.inviteCode, inviteCodes);
      if (!checked.ok) {
        const message =
          checked.reason === "missing_config"
            ? "Email registration is closed"
            : "Invalid invite code";
        throw new APIError(
          checked.reason === "missing_config" ? "FORBIDDEN" : "BAD_REQUEST",
          { message },
        );
      }

      // Do not persist inviteCode on the user record.
      const { inviteCode: _ignored, ...body } = ctx.body || {};
      return {
        context: {
          ...ctx,
          body,
        },
      };
    }),
  },
});
