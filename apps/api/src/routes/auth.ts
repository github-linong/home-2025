import { Hono } from "hono";

/**
 * Auth routes — stubs for invite + OAuth wiring.
 * Set AUTH_ENABLED=true and configure OAuth env vars when ready.
 */
export const authRoutes = new Hono();

authRoutes.get("/me", (c) => {
  // Reserved: return session user when cookie present
  return c.json({ user: null, message: "Auth reserved — all content is public for now." });
});

authRoutes.get("/github", (c) => {
  const invite = c.req.query("invite");
  return c.json({
    status: "stub",
    provider: "github",
    invite: invite ?? null,
    hint: "Wire OAuth redirect to GitHub; on callback validate invite for new users.",
  });
});

authRoutes.get("/google", (c) => {
  const invite = c.req.query("invite");
  return c.json({
    status: "stub",
    provider: "google",
    invite: invite ?? null,
    hint: "Wire OAuth redirect to Google; on callback validate invite for new users.",
  });
});

authRoutes.post("/logout", (c) => {
  return c.json({ ok: true });
});
