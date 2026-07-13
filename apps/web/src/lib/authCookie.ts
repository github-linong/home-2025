import { AUTH_COOKIE_DOMAIN } from "../config.ts";

export const AUTH_COOKIE_NAME = "auth-uuid";
/** 50 years — matches legacy lilnong.top portal behavior */
export const AUTH_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365 * 50;

export interface AuthCookiePayload {
  uuid: string;
  createdAt: number;
}

export function parseAuthCookieValue(raw: string | undefined): AuthCookiePayload | null {
  if (!raw) return null;

  const decoded = decodeURIComponent(raw);
  const hashIndex = decoded.indexOf("#");
  const uuid = hashIndex === -1 ? decoded : decoded.slice(0, hashIndex);
  const createdAt =
    hashIndex === -1 ? 0 : Number(decoded.slice(hashIndex + 1)) || 0;

  if (!uuid) return null;
  return { uuid, createdAt };
}

export function generateAuthCookieValue(now = Date.now()): string {
  return `${crypto.randomUUID()}#${now}`;
}

export function getCookieDomain(hostname: string): string | undefined {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return undefined;
  }
  return AUTH_COOKIE_DOMAIN;
}

export function buildAuthCookieSetString(
  value: string,
  hostname: string,
  maxAgeSec = AUTH_COOKIE_MAX_AGE_SEC
): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    `max-age=${maxAgeSec}`,
    "path=/",
    "SameSite=Lax",
  ];

  const domain = getCookieDomain(hostname);
  if (domain) parts.push(`domain=${domain}`);

  return parts.join("; ");
}

export function readAuthCookieRaw(doc: Pick<Document, "cookie">): string | undefined {
  const prefix = `${AUTH_COOKIE_NAME}=`;
  const row = doc.cookie.split("; ").find((entry) => entry.startsWith(prefix));
  if (!row) return undefined;
  return row.slice(prefix.length);
}

export function getVisitorIdFromDocument(doc: Document = document): string | undefined {
  return parseAuthCookieValue(readAuthCookieRaw(doc))?.uuid;
}

/** Ensure anonymous visitor cookie exists; returns visitor UUID. */
export function ensureAuthCookie(doc: Document = document): string {
  const existing = readAuthCookieRaw(doc);
  const parsed = parseAuthCookieValue(existing);
  if (parsed?.uuid) return parsed.uuid;

  const value = generateAuthCookieValue();
  doc.cookie = buildAuthCookieSetString(value, doc.location.hostname);
  return parseAuthCookieValue(value)!.uuid;
}
