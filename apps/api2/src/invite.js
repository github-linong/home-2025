/**
 * Invite codes for email sign-up (comma-separated env).
 * AUTH_INVITE_CODES=code1,code2  — or single AUTH_INVITE_CODE
 */

export function parseInviteCodes(env = process.env) {
  const raw = env.AUTH_INVITE_CODES || env.AUTH_INVITE_CODE || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * @param {string | null | undefined} inviteCode
 * @param {Set<string>} codes
 * @returns {{ ok: true } | { ok: false, reason: "missing_config" | "invalid" }}
 */
export function validateInviteCode(inviteCode, codes) {
  if (!codes || codes.size === 0) {
    return { ok: false, reason: "missing_config" };
  }
  const code = String(inviteCode || "").trim();
  if (!code || !codes.has(code)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}
