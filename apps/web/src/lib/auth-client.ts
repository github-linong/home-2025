import { createAuthClient } from "better-auth/client";

/** Same-origin in prod / Astro proxy; override with PUBLIC_AUTH_URL if needed. */
export const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_AUTH_URL || undefined,
});
