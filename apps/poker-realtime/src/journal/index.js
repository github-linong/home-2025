import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

/** @type {Map<string, string>} handId -> dir path */
const handIndex = new Map();

export async function indexJournals() {
  handIndex.clear();
  try {
    await stat(config.journalDir);
  } catch {
    return;
  }

  async function walk(dir, parts = []) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, [...parts, entry.name]);
      } else if (entry.name === "settlement.json" && parts.length >= 3) {
        const handId = parts[2];
        handIndex.set(handId, join(config.journalDir, ...parts.slice(0, 3)));
      }
    }
  }

  const rooms = await readdir(config.journalDir, { withFileTypes: true });
  for (const room of rooms) {
    if (room.isDirectory()) await walk(join(config.journalDir, room.name), [room.name]);
  }
}

export async function findHandPath(handId) {
  if (handIndex.has(handId)) return handIndex.get(handId);
  await indexJournals();
  return handIndex.get(handId) ?? null;
}

export async function readManifest(handId) {
  const path = await findHandPath(handId);
  if (!path) return null;
  const raw = await readFile(join(path, "manifest.json"), "utf8");
  return JSON.parse(raw);
}

export async function userParticipated(handId, userId) {
  const manifest = await readManifest(handId);
  if (!manifest) return false;
  return (manifest.participants ?? []).some((p) => p.userId === userId);
}
