"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const config = require("../config/env");

fs.mkdirSync(config.paths.uploads, { recursive: true });

// Max upload size (bytes). Overridable via env; defaults to 30MB to match the
// body-parser limits used elsewhere.
const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 30 * 1024 * 1024);

// Map trusted audio mimetypes to an extension when the client name has none.
const MIME_EXTENSIONS = new Map([
  ["audio/wav", ".wav"],
  ["audio/ogg", ".ogg"],
  ["audio/mpeg", ".mp3"],
]);

/**
 * Derive a safe extension (leading dot, lowercase alphanumerics only) from the
 * client filename, falling back to a mimetype-based guess. Never returns path
 * separators or dots beyond the single leading one.
 */
function safeExtension(file) {
  // path.basename strips any directory components a crafted multipart part may
  // carry (e.g. "../../evil"), so traversal never reaches the extension.
  const ext = path.extname(path.basename(file.originalname || "")).toLowerCase();
  if (/^\.[a-z0-9]{1,12}$/.test(ext)) return ext;
  return MIME_EXTENSIONS.get(file.mimetype) || "";
}

/**
 * Build the on-disk filename. Fully server-generated: timestamp + random token
 * + a sanitized extension. The client-supplied name is never used as a path
 * component, so `path.join(dest, filename)` inside multer cannot escape the
 * uploads directory. The original name is still available as file.originalname.
 */
function buildStoredName(file) {
  const token = crypto.randomBytes(16).toString("hex");
  return `${Date.now()}-${token}${safeExtension(file)}`;
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, config.paths.uploads);
  },
  filename(_req, file, cb) {
    cb(null, buildStoredName(file));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

module.exports = upload;
module.exports.buildStoredName = buildStoredName;
module.exports.safeExtension = safeExtension;
