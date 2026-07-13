"use strict";

const fs = require("fs");
const path = require("path");
const OSS = require("ali-oss");
const config = require("../config/env");

let client = null;

function isEnabled() {
  return Boolean(
    config.oss.enabled &&
      config.oss.accessKeyId &&
      config.oss.accessKeySecret &&
      config.oss.bucket
  );
}

function getClient() {
  if (!isEnabled()) return null;
  if (client) return client;
  client = new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket,
    secure: true,
  });
  return client;
}

function buildObjectKey(localFilename) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const base = path.basename(localFilename);
  return `${config.oss.prefix}/${y}/${m}/${d}/${base}`;
}

function publicUrlForKey(objectKey) {
  if (!config.oss.publicRead || !config.oss.publicBase) return null;
  const base = String(config.oss.publicBase).replace(/\/$/, "");
  return `${base}/${objectKey.replace(/^\/+/, "")}`;
}

async function putLocalFile(localPath, { objectKey } = {}) {
  const c = getClient();
  if (!c) {
    throw new Error("OSS is not configured");
  }
  const key = objectKey || buildObjectKey(localPath);
  await c.put(key, localPath);
  return {
    key,
    url: publicUrlForKey(key),
  };
}

function unlinkQuiet(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("[oss] unlink failed", filePath, err.message);
  }
}

/**
 * Upload multer file(s) to OSS, then delete local temp files.
 * If OSS is disabled, leave files on disk and return empty urls.
 */
async function archiveUploadAndCleanup(files) {
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
  const urls = [];
  const keys = [];

  if (!isEnabled()) {
    console.warn("[oss] disabled — keeping local uploads under data/uploads/");
    return { urls, keys, archived: false };
  }

  for (const file of list) {
    const localPath = file.path;
    try {
      const { key, url } = await putLocalFile(localPath);
      keys.push(key);
      if (url) urls.push(url);
    } catch (err) {
      console.error("[oss] put failed", localPath, err.message);
      // Keep local file if upload failed so AI handlers / retries can still use it
      continue;
    }
    unlinkQuiet(localPath);
  }

  return { urls, keys, archived: keys.length > 0 };
}

module.exports = {
  isEnabled,
  putLocalFile,
  archiveUploadAndCleanup,
  unlinkQuiet,
  publicUrlForKey,
};
