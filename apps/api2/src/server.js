import express from "express";
import cors from "cors";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";

process.on("uncaughtException", (err) => {
  console.error("[api2] uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[api2] unhandledRejection:", err);
});

const port = Number(process.env.API2_PORT || process.env.PORT || 3002);

const trustedOrigins = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ||
  "http://127.0.0.1:4321,http://localhost:4321,https://www.lilnong.top,https://lilnong.top"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || trustedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// IMPORTANT: mount Better Auth before express.json()
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "lilnong-api2", auth: "better-auth" });
});

app.get("/api/me", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      authenticated: Boolean(session?.user),
      user: session?.user ?? null,
      session: session?.session ?? null,
    });
  } catch (err) {
    console.error("[api2] /api/me failed:", err);
    res.status(500).json({ ok: false, error: "session_error" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[api2] listening on http://127.0.0.1:${port}`);
});
