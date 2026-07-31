import { createHash } from "node:crypto";
import { config } from "../config.js";
import { generateId } from "../core/ids.js";
import { ErrorCodes, makeError } from "../protocol/errors.js";
import {
  createHandState,
  setFirstActor,
  applyFold,
  applyCheckOrCall,
  applyRaise,
  getLegalActions,
  getRaiseBounds,
  snapshotSummary,
  newHandSeed,
  forceFoldSeat,
} from "./hand-engine.js";
import {
  clearLeaveAfterHandSeats,
  roomSnapshot,
  bumpRoomVersion,
} from "../lobby/lobby-service.js";
import {
  idempotencyKey,
  getIdempotent,
  setIdempotent,
  clearHand,
} from "./idempotency.js";
import {
  initHandJournal,
  appendEvent,
  appendCheckpoint,
  writeSettlement,
  writeFinalizeOk,
  buildSettlement,
} from "../journal/writer.js";
import { hashDeckSeed } from "../core/ids.js";
import { log } from "../logging/logger.js";

/** @type {Map<string, MatchRuntime>} */
export const matches = new Map();

export class MatchRuntime {
  constructor(room, onBroadcast, onHandEnd) {
    this.room = room;
    this.matchId = generateId("match");
    this.state = "active";
    this.handNumber = 0;
    this.handId = null;
    this.handState = null;
    this.deckSeed = null;
    this.dealerIndex = -1;
    this.queue = [];
    this.processing = false;
    this.nextSeq = 0;
    this.onBroadcast = onBroadcast;
    this.onHandEnd = onHandEnd;
    this.actionTimer = null;
    this.graceTimer = null;
    this.destroyTimer = null;
    this.nextHandTimer = null;
    this.handIds = [];
    this.handSettlementHashes = [];
    this.participants = [];
    /** @type {Map<string, number>} userId -> shortened timeout ms until next successful action */
    this.reconnectTimeoutByUser = new Map();
  }

  enqueue(msg) {
    const seq = this.nextSeq++;
    return new Promise((resolve) => {
      this.queue.push({ ...msg, seq, resolve });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      try {
        const result = await this.handleMessage(item);
        item.resolve({ seq: item.seq, ok: true, ...result });
      } catch (err) {
        item.resolve({
          seq: item.seq,
          ok: false,
          error: err.code
            ? err
            : makeError(ErrorCodes.INTERNAL_ERROR, err.message),
        });
      }
    }
    this.processing = false;
  }

  async handleMessage(item) {
    const { type, userId, payload } = item;
    if (type === "game.action") return this.handleAction(userId, payload);
    if (type === "game.ping") return { pong: true };
    if (type === "sync.request") return this.handleSync(userId, payload);
    if (type === "seat.forceFold") return this.handleForceFold(userId);
    throw makeError(ErrorCodes.INVALID_ACTION, "Unknown runtime message");
  }

  startMatch() {
    this.participants = this.room.seats
      .filter((s) => s.userId && s.stack > 0)
      .map((s) => ({ userId: s.userId, seatIndex: s.seatIndex, displayName: s.displayName }));
    this.startHand();
    return { matchId: this.matchId, handId: this.handId };
  }

  startHand() {
    this.handNumber += 1;
    this.handId = generateId("hand");
    this.handIds.push(this.handId);
    this.deckSeed = newHandSeed();

    const playingSeats = this.room.seats
      .filter(
        (s) =>
          s.userId &&
          s.stack > 0 &&
          !s.leaveAfterHand &&
          s.status !== "empty" &&
          s.status !== "left",
      )
      .map((s) => ({
        seatIndex: s.seatIndex,
        userId: s.userId,
        displayName: s.displayName,
        stack: s.stack || config.tableStartStack,
        status: s.status,
      }));

    if (playingSeats.length < 2) {
      this.endMatch();
      return;
    }

    const seatIndices = playingSeats.map((s) => s.seatIndex);
    this.dealerIndex =
      this.dealerIndex === -1
        ? seatIndices[0]
        : this.nextDealer(seatIndices);

    const initialMatchVersion = (this.handState?.matchVersion ?? 0) + 1;
    const { state, positions } = createHandState(
      playingSeats,
      playingSeats.findIndex((s) => s.seatIndex === this.dealerIndex),
      this.handId,
      this.deckSeed,
      { initialMatchVersion },
    );
    this.handState = state;

    const actorResult = setFirstActor(state, positions.bigBlindIndex);
    if (actorResult.runout) {
      this.broadcastPublic();
      this.finishHand({ reason: "runout" });
      return;
    }

    initHandJournal(this.room.roomId, this.matchId, this.handId, {
      handId: this.handId,
      roomId: this.room.roomId,
      matchId: this.matchId,
      participants: this.participants,
      deckSeed: this.deckSeed,
      deckSeedHash: hashDeckSeed(this.deckSeed),
      seedCommit: null,
      seedReveal: null,
      startedAt: Date.now(),
    }).catch((e) => log("error", "journal_init_failed", { error: e.message }));

    appendEvent(this.room.roomId, this.matchId, this.handId, {
      seq: 1,
      eventType: "handStarted",
      handId: this.handId,
      deckSeed: this.deckSeed,
      deckSeedHash: hashDeckSeed(this.deckSeed),
      dealerIndex: this.dealerIndex,
      matchVersion: state.matchVersion,
    }).catch(() => {});

    // Announce the hand first, then push snapshots (clients must not clear private after snapshots).
    this.onBroadcast({
      type: "game.event",
      eventType: "handStarted",
      matchId: this.matchId,
      handId: this.handId,
      stateVersion: state.matchVersion,
    });
    this.broadcastPublic();
    this.broadcastPrivateToAll();
    this.scheduleActionTimer();
  }

  nextDealer(seatIndices) {
    let idx = this.dealerIndex;
    for (let i = 0; i < config.maxSeats; i += 1) {
      idx = (idx + 1) % config.maxSeats;
      if (seatIndices.includes(idx)) return idx;
    }
    return seatIndices[0];
  }

  handleAction(userId, payload) {
    const { handId, turnId, clientActionId, action, amount } = payload;
    const state = this.handState;
    if (!state || state.finished) throw makeError(ErrorCodes.MATCH_NOT_FOUND);
    if (handId !== this.handId) throw makeError(ErrorCodes.STALE_TURN);
    if (turnId !== state.turnId) throw makeError(ErrorCodes.STALE_TURN);

    const seatIndex = state.seats.findIndex((s) => s.userId === userId);
    if (seatIndex === -1) throw makeError(ErrorCodes.FORBIDDEN);
    if (state.turnIndex !== seatIndex) throw makeError(ErrorCodes.NOT_YOUR_TURN);

    const idemKey = idempotencyKey(
      this.room.roomId,
      userId,
      handId,
      turnId,
      clientActionId,
    );
    const cached = getIdempotent(idemKey);
    if (cached) {
      return {
        code: ErrorCodes.IDEMPOTENT_REPLAY_OK,
        matchVersion: cached.matchVersion,
        result: cached.result,
      };
    }

    const before = snapshotSummary(state);
    let result;

    if (action === "fold") {
      result = applyFold(state, seatIndex);
    } else if (action === "call" || action === "check") {
      result = applyCheckOrCall(state, seatIndex);
    } else if (action === "raise") {
      const r = applyRaise(state, seatIndex, amount ?? 0);
      if (!r.ok) throw makeError(ErrorCodes.INVALID_ACTION);
      result = r;
    } else if (action === "allin") {
      const bounds = getRaiseBounds(state, seatIndex);
      const r = applyRaise(state, seatIndex, bounds.maximum, true);
      if (!r.ok) {
        result = applyCheckOrCall(state, seatIndex);
      } else {
        result = r;
      }
    } else {
      throw makeError(ErrorCodes.INVALID_ACTION);
    }

    const after = snapshotSummary(state);
    appendEvent(this.room.roomId, this.matchId, this.handId, {
      seq: state.matchVersion,
      eventType: "actionApplied",
      handId,
      turnId,
      actorUserId: userId,
      action,
      amount,
      clientActionId,
      before,
      after,
      matchVersion: state.matchVersion,
    }).catch(() => {});

    appendCheckpoint(this.room.roomId, this.matchId, this.handId, after).catch(
      () => {},
    );

    setIdempotent(idemKey, result, state.matchVersion);
    this.clearActionTimer();
    if (userId) this.reconnectTimeoutByUser.delete(userId);

    this.syncStacksToRoom();
    this.broadcastPublic();
    this.broadcastPrivateToAll();

    if (result.type === "handEnd") {
      this.finishHand(result);
    } else {
      this.scheduleActionTimer();
    }

    return { matchVersion: state.matchVersion, result };
  }

  handleSync(_userId, payload) {
    const { lastKnownVersion } = payload;
    const state = this.handState;
    if (!state) throw makeError(ErrorCodes.MATCH_NOT_FOUND);
    // Always re-push current snapshots; client uses them to catch up.
    this.broadcastPublic();
    this.broadcastPrivateToAll();
    return {
      matchVersion: state.matchVersion,
      caughtUp: lastKnownVersion < state.matchVersion,
    };
  }

  finishHand(result) {
    const state = this.handState;
    const settlement = buildSettlement(state, this.deckSeed);
    this.handSettlementHashes.push(settlement.contentHash);
    writeSettlement(this.room.roomId, this.matchId, this.handId, settlement).catch(
      () => {},
    );

    appendEvent(this.room.roomId, this.matchId, this.handId, {
      eventType: "settlement",
      settlement,
      matchVersion: state.matchVersion,
    }).catch(() => {});

    clearHand(this.handId);
    this.syncStacksToRoom();
    clearLeaveAfterHandSeats(this.room);

    if (config.autoRebuyOnBust) {
      this.rebuyBustedSeats();
    }

    const activePlayers = this.room.seats.filter(
      (s) =>
        s.userId &&
        s.stack > 0 &&
        !s.leaveAfterHand &&
        s.status !== "left" &&
        s.status !== "empty",
    );
    const continues = activePlayers.length >= 2 && this.state === "active";

    this.onBroadcast({
      type: "game.event",
      eventType: "handEnded",
      matchId: this.matchId,
      handId: this.handId,
      stateVersion: state.matchVersion,
      payload: {
        winners: result.winners,
        reason: result.reason,
        continues,
        activeCount: activePlayers.length,
      },
    });
    bumpRoomVersion(this.room);
    this.onBroadcast(roomSnapshot(this.room));

    this.onHandEnd(this, result);

    if (continues) {
      if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
      this.nextHandTimer = setTimeout(() => {
        this.nextHandTimer = null;
        try {
          this.startHand();
        } catch (err) {
          log("error", "next_hand_failed", {
            matchId: this.matchId,
            error: err?.message || String(err),
          });
          this.endMatch();
        }
      }, 1500);
    } else {
      log("info", "match_end_after_hand", {
        matchId: this.matchId,
        activeCount: activePlayers.length,
        reason: result.reason,
      });
      this.endMatch();
    }
  }

  /** Restore starting stack for seated players who busted (practice tables). */
  rebuyBustedSeats() {
    for (const seat of this.room.seats) {
      if (!seat.userId) continue;
      if (seat.status === "left" || seat.status === "empty") continue;
      if (seat.leaveAfterHand) continue;
      if (seat.stack > 0) continue;
      seat.stack = config.tableStartStack;
      seat.status = seat.ready ? "ready" : "occupied";
    }
  }

  endMatch() {
    if (this.state === "grace" || this.state === "finalize" || this.state === "archived") {
      return;
    }
    this.state = "grace";
    this.clearActionTimer();
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }
    this.room.roomState = "postMatchGrace";
    bumpRoomVersion(this.room);
    this.onBroadcast({
      type: "game.event",
      eventType: "matchEnded",
      matchId: this.matchId,
      handId: this.handId,
      stateVersion: this.handState?.matchVersion ?? 0,
      payload: { reason: "insufficient_players_or_owner_end" },
    });
    this.onBroadcast(roomSnapshot(this.room));
    if (this.onHandEnd) this.onHandEnd(this, { type: "matchEnd" });
    this.graceTimer = setTimeout(() => {
      this.finalize().catch((e) =>
        log("error", "finalize_failed", { matchId: this.matchId, error: e.message }),
      );
    }, config.gracePeriodMs);
    this.graceTimer.unref?.();
  }

  async finalize() {
    if (this.state !== "grace") return;
    this.state = "finalize";
    let attempts = 0;
    while (attempts < 3) {
      try {
        await writeFinalizeOk(this.room.roomId, this.matchId, {
          handIds: this.handIds,
          contentHash: createHash("sha256")
            .update(this.handSettlementHashes.slice().sort().join("|"))
            .digest("hex"),
        });
        break;
      } catch (err) {
        attempts += 1;
        if (attempts >= 3) {
          log("error", "finalize_ok_write_failed", {
            matchId: this.matchId,
            error: err.message,
          });
          return;
        }
      }
    }
    this.state = "archived";
    this.room.roomState = "archived";
    this.destroyTimer = setTimeout(() => {
      this.state = "destroyed";
      destroyMatch(this.matchId);
    }, config.finalizeGcMs);
    this.destroyTimer.unref?.();
  }

  syncStacksToRoom() {
    if (!this.handState) return;
    for (const hs of this.handState.seats) {
      const roomSeat = this.room.seats[hs.seatIndex];
      if (roomSeat && roomSeat.userId === hs.userId) {
        roomSeat.stack = hs.stack;
      }
    }
  }

  scheduleActionTimer() {
    this.clearActionTimer();
    const state = this.handState;
    if (!state || state.finished || state.turnIndex < 0) return;

    const actor = state.seats[state.turnIndex];
    const roomSeat = actor ? this.room.seats[actor.seatIndex] : null;
    let timeoutMs = config.actionTimeoutMs;
    if (roomSeat?.isBot) {
      timeoutMs = config.botActionDelayMs;
    } else if (actor?.userId && this.reconnectTimeoutByUser.has(actor.userId)) {
      timeoutMs = Math.min(timeoutMs, this.reconnectTimeoutByUser.get(actor.userId));
    }

    this.actionTimer = setTimeout(() => {
      this.autoAction();
    }, timeoutMs);
    this.actionTimer.unref?.();
  }

  /** After reconnect, next action window for this user uses shortened timeout. */
  noteReconnect(userId) {
    if (!userId) return;
    this.reconnectTimeoutByUser.set(userId, config.reconnectActionTimeoutMs);
    const state = this.handState;
    if (state && !state.finished && state.turnIndex >= 0) {
      const actor = state.seats[state.turnIndex];
      if (actor?.userId === userId) this.scheduleActionTimer();
    }
  }

  autoAction() {
    const state = this.handState;
    if (!state || state.finished || state.turnIndex < 0) return;

    const seatIndex = state.turnIndex;
    const seat = state.seats[seatIndex];
    if (!seat?.userId) return;
    const roomSeat = this.room.seats[seat.seatIndex];
    const bounds = getRaiseBounds(state, seatIndex);
    const legal = getLegalActions(state, seatIndex);
    const clientActionId = `auto_${state.turnId}`;

    let action = bounds.fullCallAmount === 0 ? "check" : "fold";
    let amount;
    if (roomSeat?.isBot) {
      if (bounds.fullCallAmount === 0 && legal.actions.includes("check")) {
        action = "check";
      } else if (legal.actions.includes("call")) {
        action = "call";
        if (
          legal.actions.includes("raise") &&
          bounds.canRaise &&
          Math.random() < 0.2
        ) {
          action = "raise";
          const span = Math.max(0, bounds.maximum - bounds.minimum);
          amount = bounds.minimum + Math.floor(span * 0.35);
        }
      } else if (legal.actions.includes("check")) {
        action = "check";
      } else {
        action = "fold";
      }
    }

    this.enqueue({
      type: "game.action",
      userId: seat.userId,
      payload: {
        handId: this.handId,
        turnId: state.turnId,
        clientActionId,
        action,
        amount,
      },
    }).catch(() => {});
  }

  handleForceFold(userId) {
    const state = this.handState;
    if (!state || state.finished) return { ok: true, skipped: true };

    const seatIndex = state.seats.findIndex((s) => s.userId === userId);
    if (seatIndex === -1) return { ok: true, skipped: true };

    const result = forceFoldSeat(state, seatIndex);
    if (result.type === "noop") {
      return { ok: true, skipped: true, allIn: result.allIn };
    }

    appendEvent(this.room.roomId, this.matchId, this.handId, {
      eventType: "forceFold",
      userId,
      seatIndex,
      matchVersion: state.matchVersion,
    }).catch(() => {});

    this.broadcastPublic();
    this.broadcastPrivateToAll();

    if (result.type === "handEnd" || state.finished) {
      this.clearActionTimer();
      this.finishHand(result);
    } else {
      this.scheduleActionTimer();
    }
    return { ok: true, result };
  }

  /** Enqueue a force-fold for kick / voluntary leave mid-hand. */
  requestForceFold(userId) {
    return this.enqueue({ type: "seat.forceFold", userId, payload: {} });
  }

  clearActionTimer() {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }

  clearLifecycleTimers() {
    this.clearActionTimer();
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (this.destroyTimer) {
      clearTimeout(this.destroyTimer);
      this.destroyTimer = null;
    }
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }
  }

  buildPublicSnapshot() {
    const state = this.handState;
    if (!state) return null;
    const actor = state.seats[state.turnIndex];
    let community = [];
    if (state.street === "flop" || state.street === "turn" || state.street === "river") {
      community = state.community.slice(
        0,
        state.street === "flop" ? 3 : state.street === "turn" ? 4 : 5,
      );
    }
    if (state.reveal) community = state.community;

    return {
      type: "game.snapshot.public",
      protocolVersion: config.protocolVersion,
      matchId: this.matchId,
      handId: this.handId,
      stateVersion: state.matchVersion,
      street: state.street,
      pot: state.pot,
      community,
      seatsPublic: state.seats.map((s) => ({
        seatIndex: s.seatIndex,
        userId: s.userId,
        displayName: s.displayName,
        stack: s.stack,
        streetBet: s.streetBet,
        folded: s.folded,
        allIn: s.allIn,
        holeCards: state.reveal && !s.folded ? s.hole : undefined,
      })),
      turnId: state.turnId,
      actorSeatId: actor?.seatIndex ?? -1,
      dealerIndex: this.dealerIndex,
      finished: state.finished,
    };
  }

  buildPrivateSnapshot(userId) {
    const state = this.handState;
    if (!state) return null;
    const seat = state.seats.find((s) => s.userId === userId);
    if (!seat) return null;
    const legal = getLegalActions(state, state.seats.indexOf(seat));
    return {
      type: "game.snapshot.private",
      targetUserId: seat.userId,
      protocolVersion: config.protocolVersion,
      matchId: this.matchId,
      handId: this.handId,
      stateVersion: state.matchVersion,
      holeCards: seat.hole,
      legalActions: legal.actions,
      raiseBounds: legal.raiseBounds,
      turnId: state.turnId,
    };
  }

  broadcastPublic() {
    const snap = this.buildPublicSnapshot();
    if (snap) this.onBroadcast(snap);
  }

  broadcastPrivateToAll() {
    const state = this.handState;
    if (!state) return;
    for (const seat of state.seats) {
      const snap = this.buildPrivateSnapshot(seat.userId);
      if (snap) this.onBroadcast(snap);
    }
  }

  getPublicSnapshot() {
    return this.handState ? { matchVersion: this.handState.matchVersion } : null;
  }
}

export function createMatch(room, onBroadcast, onHandEnd) {
  const runtime = new MatchRuntime(room, onBroadcast, onHandEnd);
  matches.set(runtime.matchId, runtime);
  room.matchId = runtime.matchId;
  return runtime;
}

export function getMatch(matchId) {
  return matches.get(matchId) ?? null;
}

export function destroyMatch(matchId) {
  const m = matches.get(matchId);
  if (m) {
    m.clearLifecycleTimers?.();
    m.clearActionTimer();
    matches.delete(matchId);
  }
}
