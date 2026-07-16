import { mkdir, writeFile, readFile, appendFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { config } from "../config.js";
import { hashDeckSeed } from "../core/ids.js";

function handDir(roomId, matchId, handId) {
  return join(config.journalDir, roomId, matchId, handId);
}

export async function initHandJournal(roomId, matchId, handId, manifest) {
  const dir = handDir(roomId, matchId, handId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export async function appendEvent(roomId, matchId, handId, event) {
  const dir = handDir(roomId, matchId, handId);
  const line = JSON.stringify({ ...event, serverTime: Date.now() }) + "\n";
  await appendFile(join(dir, "events.ndjson"), line);
}

export async function appendCheckpoint(roomId, matchId, handId, checkpoint) {
  const dir = handDir(roomId, matchId, handId);
  const line = JSON.stringify(checkpoint) + "\n";
  await appendFile(join(dir, "checkpoints.ndjson"), line);
}

export async function writeFinalizeOk(roomId, matchId, payload) {
  const dir = join(config.journalDir, roomId, matchId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "finalize.ok"),
    JSON.stringify({ ...payload, flushTime: Date.now() }, null, 2),
  );
}

export async function writeSettlement(roomId, matchId, handId, settlement) {
  const dir = handDir(roomId, matchId, handId);
  await writeFile(join(dir, "settlement.json"), JSON.stringify(settlement, null, 2));
}

export async function readSettlement(handId) {
  const { findHandPath } = await import("./index.js");
  const path = await findHandPath(handId);
  if (!path) return null;
  const raw = await readFile(join(path, "settlement.json"), "utf8");
  return JSON.parse(raw);
}

export async function readEvents(handId, cursor = 0, limit = 50) {
  const { findHandPath } = await import("./index.js");
  const path = await findHandPath(handId);
  if (!path) return { events: [], nextCursor: cursor };
  const raw = await readFile(join(path, "events.ndjson"), "utf8").catch(() => "");
  const lines = raw.trim().split("\n").filter(Boolean);
  const slice = lines.slice(cursor, cursor + limit).map((l) => JSON.parse(l));
  return { events: slice, nextCursor: cursor + slice.length, total: lines.length };
}

export function buildSettlement(state, deckSeed) {
  return {
    handId: state.handId,
    deckSeed,
    deckSeedHash: hashDeckSeed(deckSeed),
    seedCommit: null,
    seedReveal: null,
    finalStacks: state.seats.map((s) => ({
      userId: s.userId,
      seatIndex: s.seatIndex,
      stack: s.stack,
    })),
    pots: state.sidePots ?? [],
    contentHash: createHash("sha256")
      .update(JSON.stringify(state.seats.map((s) => s.stack)))
      .digest("hex"),
  };
}
