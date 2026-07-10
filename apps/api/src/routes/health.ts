import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "personal-site-api",
    authEnabled: process.env.AUTH_ENABLED === "true",
  });
});
