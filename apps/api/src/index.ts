import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";

const app = new Hono();

const siteUrl = process.env.SITE_URL ?? "http://localhost:4321";

app.use(
  "/api/*",
  cors({
    origin: siteUrl,
    credentials: true,
  })
);

app.route("/api", healthRoutes);
app.route("/api/auth", authRoutes);

app.get("/login", (c) => {
  return c.html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Login</title></head>
<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">
  <h1>Login (reserved)</h1>
  <p>OAuth + invite flow will be wired here. Public site stays open.</p>
  <ul>
    <li><a href="/api/auth/github">GitHub OAuth (stub)</a></li>
    <li><a href="/api/auth/google">Google OAuth (stub)</a></li>
  </ul>
  <p><a href="/">← Back to site</a></p>
</body></html>`);
});

app.get("/invite/:token", (c) => {
  const token = c.req.param("token");
  return c.html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Invite</title></head>
<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">
  <h1>Invite registration</h1>
  <p>Token: <code>${token}</code></p>
  <p>After OAuth callback, server validates invite before creating user.</p>
  <ul>
    <li><a href="/api/auth/github?invite=${token}">Continue with GitHub</a></li>
    <li><a href="/api/auth/google?invite=${token}">Continue with Google</a></li>
  </ul>
</body></html>`);
});

const port = Number(process.env.API_PORT ?? 3001);

console.log(`API listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
