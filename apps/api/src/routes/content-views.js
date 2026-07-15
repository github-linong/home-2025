"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const config = require("../config/env");

const STORE_PATH = path.join(config.paths.root, "data", "content-views.json");
const ALLOWED_TYPES = new Set(["blog", "demo"]);

fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });

/** @type {Record<string, number>} */
let views = {};
let dirty = false;
let writeTimer = null;

function load() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      views = {};
      return;
    }
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    views = raw && typeof raw.views === "object" && raw.views ? raw.views : {};
  } catch (err) {
    console.error("[content-views] load failed:", err.message || err);
    views = {};
  }
}

function scheduleWrite() {
  dirty = true;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      const tmp = `${STORE_PATH}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ updatedAt: Date.now(), views }, null, 0));
      fs.renameSync(tmp, STORE_PATH);
    } catch (err) {
      console.error("[content-views] write failed:", err.message || err);
      dirty = true;
    }
  }, 800);
}

function keyFor(type, slug) {
  return `${type}:${slug}`;
}

load();

const router = express.Router();

router.get("/api/content-views", (_req, res) => {
  res.set("Cache-Control", "public, max-age=30");
  res.json({ views });
});

router.post("/api/content-views", (req, res) => {
  const type = String(req.body?.type || "").trim();
  const slug = String(req.body?.slug || "")
    .trim()
    .slice(0, 200);

  // Allow Unicode letters/numbers (Chinese demo slugs like 架构图编辑器) while
  // rejecting path/query characters that would break storage keys.
  const slugOk = /^[\p{L}\p{N}._~\-]+$/u.test(slug);
  if (!ALLOWED_TYPES.has(type) || !slug || !slugOk) {
    res.status(400).json({ ok: false, error: "invalid type or slug" });
    return;
  }

  const key = keyFor(type, slug);
  const next = (Number(views[key]) || 0) + 1;
  views[key] = next;
  scheduleWrite();
  res.json({ ok: true, key, views: next });
});

module.exports = router;
