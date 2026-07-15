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
