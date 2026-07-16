import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findHandPath } from "./index.js";
import {
  createHandState,
  applyCheckOrCall,
  applyFold,
  applyRaise,
  getRaiseBounds,
  setFirstActor,
  snapshotSummary,
} from "../match/hand-engine.js";
import { buildSettlement } from "./writer.js";

function stacksEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x.seatIndex - y.seatIndex);
  const b = [...right].sort((x, y) => x.seatIndex - y.seatIndex);
  return JSON.stringify(a) === JSON.stringify(b);
}

function inferDealerIndex(events, seats) {
  const started = events.find((e) => e.eventType === "handStarted");
  if (typeof started?.dealerIndex === "number") return started.dealerIndex;
  const first = events.find((e) => e.eventType === "actionApplied" && e.before);
  // Prefer seat with highest initial committed relative to start — fall back to min seatIndex
  if (first?.before?.seats?.length) {
    const withBet = first.before.seats.filter((s) => (s.totalBet ?? s.streetBet ?? 0) > 0);
    if (withBet.length >= 1) {
      // heads-up: dealer is SB; multiway: dealer is seat before SB
      const ordered = [...withBet].sort((a, b) => a.seatIndex - b.seatIndex);
      return ordered[0].seatIndex;
    }
  }
  return seats[0]?.seatIndex ?? 0;
}

/**
 * Rebuild hand from journal: deckSeed + actionApplied sequence, compare to settlement.
 */
export async function replayHand(handId) {
  const path = await findHandPath(handId);
  if (!path) return { ok: false, error: "NOT_FOUND" };

  const eventsRaw = await readFile(join(path, "events.ndjson"), "utf8").catch(() => "");
  const settlementRaw = await readFile(join(path, "settlement.json"), "utf8");
  const manifestRaw = await readFile(join(path, "manifest.json"), "utf8").catch(() => "{}");
  const settlement = JSON.parse(settlementRaw);
  const manifest = JSON.parse(manifestRaw);
  const events = eventsRaw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const started = events.find((e) => e.eventType === "handStarted");
  const deckSeed = started?.deckSeed ?? settlement.deckSeed ?? manifest.deckSeed;
  if (!deckSeed) {
    return { ok: false, error: "MISSING_DECK_SEED" };
  }

  const firstAction = events.find((e) => e.eventType === "actionApplied");
  const seats =
    firstAction?.before?.seats?.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      displayName: s.userId,
      stack: s.stack + (s.totalBet ?? 0),
      status: "occupied",
    })) ??
    settlement.finalStacks?.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      displayName: s.userId,
      stack: 500,
      status: "occupied",
    }));

  if (!seats || seats.length < 2) {
    return { ok: false, error: "MISSING_SEATS" };
  }

  const tableDealer = inferDealerIndex(events, seats);
  // createHandState expects dealerIndex as index into the playing seats array
  const dealerInPlaying = Math.max(
    0,
    seats.findIndex((s) => s.seatIndex === tableDealer),
  );
  const { state, positions } = createHandState(
    seats,
    dealerInPlaying === -1 ? 0 : dealerInPlaying,
    handId,
    deckSeed,
  );
  setFirstActor(state, positions.bigBlindIndex);

  let mismatch = null;
  const actions = events.filter((e) => e.eventType === "actionApplied");

  for (const event of actions) {
    if (state.finished) break;
    const seatIndex = state.seats.findIndex((s) => s.userId === event.actorUserId);
    if (seatIndex === -1) {
      mismatch = { seq: event.seq, field: "actorUserId", expected: event.actorUserId };
      break;
    }

    const before = snapshotSummary(state);
    if (event.before && before.pot !== event.before.pot) {
      mismatch = {
        seq: event.seq,
        field: "before.pot",
        expected: event.before.pot,
        actual: before.pot,
      };
      break;
    }

    let result;
    if (event.action === "fold") result = applyFold(state, seatIndex);
    else if (event.action === "call" || event.action === "check") {
      result = applyCheckOrCall(state, seatIndex);
    } else if (event.action === "raise") {
      result = applyRaise(state, seatIndex, event.amount ?? 0);
      if (result && result.ok === false) {
        mismatch = { seq: event.seq, field: "raise", reason: result.reason };
        break;
      }
    } else if (event.action === "allin") {
      const bounds = getRaiseBounds(state, seatIndex);
      result = applyRaise(state, seatIndex, bounds.maximum, true);
      if (result && result.ok === false) result = applyCheckOrCall(state, seatIndex);
    } else {
      mismatch = { seq: event.seq, field: "action", expected: event.action };
      break;
    }

    const after = snapshotSummary(state);
    if (event.after && after.pot !== event.after.pot) {
      mismatch = {
        seq: event.seq,
        field: "after.pot",
        expected: event.after.pot,
        actual: after.pot,
      };
      break;
    }
  }

  const rebuilt = buildSettlement(state, deckSeed);
  const match =
    !mismatch &&
    stacksEqual(rebuilt.finalStacks, settlement.finalStacks) &&
    rebuilt.contentHash === settlement.contentHash;

  return {
    ok: match,
    rebuilt: rebuilt.contentHash,
    settlement: settlement.contentHash,
    match,
    mismatch,
    finalStacks: rebuilt.finalStacks,
  };
}
