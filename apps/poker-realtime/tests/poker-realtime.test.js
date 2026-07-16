import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createHandState,
  setFirstActor,
  applyFold,
  applyCheckOrCall,
  applyRaise,
  getRaiseBounds,
  newHandSeed,
  snapshotSummary,
} from "../src/match/hand-engine.js";
import {
  idempotencyKey,
  getIdempotent,
  setIdempotent,
  clearHand,
} from "../src/match/idempotency.js";
import { createRoom, lockSeat, confirmSeat, allReady, setReady, validateReconnect, leaveRoom, rooms, sweepIdleEmptyRooms, destroyRoom, addBotSeat, removeOneBotSeat, finalizeRemoveBot, effectiveOwnerId, transferOwner, markLeaveAfterHand, clearLeaveAfterHandSeats } from "../src/lobby/lobby-service.js";
import {
  checkRateLimit,
  checkIpRateLimit,
  forceAbuseBan,
  isAbuseBanned,
  resetRateLimits,
} from "../src/rate-limit/limiter.js";
import { generateDeckSeed, createSeededDeck, hashDeckSeed } from "../src/core/ids.js";
import { settleUncalledBetsMulti } from "../src/core/pokerBetting.mjs";
import { verifyWithApi2 } from "../src/auth/session.js";
import { MatchRuntime, destroyMatch } from "../src/match/runtime.js";
import { config } from "../src/config.js";
import {
  initHandJournal,
  appendEvent,
  writeSettlement,
  buildSettlement,
  writeFinalizeOk,
  readSettlement,
} from "../src/journal/writer.js";
import { indexJournals, userParticipated } from "../src/journal/index.js";
import { replayHand } from "../src/journal/replay.js";
import {
  registerConnection,
  kickConnection,
  getConnection,
  activeUserConn,
} from "../src/ws/connection-registry.js";

describe("hand-engine", () => {
  it("starts a hand with blinds posted", () => {
    const seats = [
      { seatIndex: 0, userId: "u1", displayName: "A", stack: 500, status: "occupied" },
      { seatIndex: 1, userId: "u2", displayName: "B", stack: 500, status: "occupied" },
    ];
    const seed = newHandSeed();
    const { state } = createHandState(seats, 0, "hand_1", seed);
    assert.ok(state.pot >= 15);
    assert.equal(state.seats.length, 2);
    assert.equal(state.seats[0].hole.length, 2);
  });

  it("allows fold and ends hand when one player remains", () => {
    const seats = [
      { seatIndex: 0, userId: "u1", displayName: "A", stack: 500, status: "occupied" },
      { seatIndex: 1, userId: "u2", displayName: "B", stack: 500, status: "occupied" },
    ];
    const { state } = createHandState(seats, 0, "hand_2", newHandSeed());
    setFirstActor(state, 1);
    const actor = state.turnIndex;
    const result = applyFold(state, actor);
    assert.equal(result.type, "handEnd");
    assert.equal(result.reason, "folds");
  });

  it("deterministic deck from seed", () => {
    const seed = generateDeckSeed();
    const d1 = createSeededDeck(seed);
    const d2 = createSeededDeck(seed);
    assert.equal(JSON.stringify(d1), JSON.stringify(d2));
  });

  it("refunds uncalled excess before showdown path", () => {
    const seats = [
      { userId: "u1", totalBet: 100, stack: 0 },
      { userId: "u2", totalBet: 40, stack: 60 },
    ];
    const potRef = { pot: 140 };
    const refunds = settleUncalledBetsMulti(seats, potRef);
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].amount, 60);
    assert.equal(seats[0].stack, 60);
    assert.equal(potRef.pot, 80);
  });
});

describe("idempotency", () => {
  it("returns cached result for same key", () => {
    const key = idempotencyKey("r1", "u1", "h1", 1, "ca1");
    setIdempotent(key, { type: "turn" }, 5);
    const cached = getIdempotent(key);
    assert.equal(cached.matchVersion, 5);
    clearHand("h1");
    assert.equal(getIdempotent(key), null);
  });

  it("treats different turnId as different keys", () => {
    const a = idempotencyKey("r1", "u1", "h1", 1, "same");
    const b = idempotencyKey("r1", "u1", "h1", 2, "same");
    setIdempotent(a, { ok: 1 }, 1);
    assert.equal(getIdempotent(b), null);
    clearHand("h1");
  });
});

describe("lobby", () => {
  it("creates room and requires all ready to start", () => {
    const room = createRoom("owner", "Owner");
    lockSeat(room, "owner", 0);
    confirmSeat(room, "owner", "Owner", 0);
    lockSeat(room, "u2", 1);
    confirmSeat(room, "u2", "P2", 1);
    assert.equal(allReady(room), false);
    setReady(room, "owner", true);
    setReady(room, "u2", true);
    assert.equal(allReady(room), true);
  });
});

describe("rate-limit", () => {
  it("limits excessive room.create", () => {
    const userId = "rate-test-user-" + Date.now();
    let blocked = false;
    for (let i = 0; i < 10; i += 1) {
      const r = checkRateLimit(userId, "room.create");
      if (!r.ok) blocked = true;
    }
    assert.equal(blocked, true);
  });
});

describe("dev auth multi-user", () => {
  it("assigns distinct ids from query/cookie in DEV_SKIP_AUTH", async () => {
    process.env.DEV_SKIP_AUTH = "true";
    const a = await verifyWithApi2("", { devUserId: "dev_alice" });
    const b = await verifyWithApi2("", { devUserId: "dev_bob" });
    assert.equal(a.userId, "dev_alice");
    assert.equal(b.userId, "dev_bob");
  });
});

describe("match lifecycle", () => {
  it("transitions grace -> finalize -> archived", async () => {
    const room = createRoom("owner", "Owner");
    lockSeat(room, "owner", 0);
    confirmSeat(room, "owner", "Owner", 0);
    lockSeat(room, "u2", 1);
    confirmSeat(room, "u2", "P2", 1);
    room.seats[0].stack = 500;
    room.seats[1].stack = 500;
    room.roomState = "inMatch";

    const prevGrace = config.gracePeriodMs;
    const prevGc = config.finalizeGcMs;
    config.gracePeriodMs = 20;
    config.finalizeGcMs = 50;

    const runtime = new MatchRuntime(room, () => {}, () => {});
    runtime.handIds = ["hand_test"];
    runtime.endMatch();
    assert.equal(runtime.state, "grace");

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(runtime.state, "archived");
    runtime.clearLifecycleTimers();

    config.gracePeriodMs = prevGrace;
    config.finalizeGcMs = prevGc;
  });
});

describe("journal replay", () => {
  it("rebuilds settlement from deckSeed and actions", async () => {
    const roomId = "room_replay";
    const matchId = "match_replay";
    const handId = "hand_replay_" + Date.now();
    const seats = [
      { seatIndex: 0, userId: "u1", displayName: "A", stack: 500, status: "occupied" },
      { seatIndex: 1, userId: "u2", displayName: "B", stack: 500, status: "occupied" },
    ];
    const seed = newHandSeed();
    const { state, positions } = createHandState(seats, 0, handId, seed);
    setFirstActor(state, positions.bigBlindIndex);

    await initHandJournal(roomId, matchId, handId, {
      handId,
      roomId,
      matchId,
      participants: seats.map((s) => ({ userId: s.userId, seatIndex: s.seatIndex })),
      deckSeed: seed,
      deckSeedHash: hashDeckSeed(seed),
      startedAt: Date.now(),
    });

    await appendEvent(roomId, matchId, handId, {
      seq: 1,
      eventType: "handStarted",
      handId,
      deckSeed: seed,
      deckSeedHash: hashDeckSeed(seed),
      dealerIndex: 0,
      matchVersion: state.matchVersion,
    });

    const actor = state.turnIndex;
    const before = snapshotSummary(state);
    const result = applyFold(state, actor);
    const after = snapshotSummary(state);
    await appendEvent(roomId, matchId, handId, {
      seq: 2,
      eventType: "actionApplied",
      actorUserId: state.seats[actor].userId,
      action: "fold",
      before,
      after,
      matchVersion: state.matchVersion,
    });

    const settlement = buildSettlement(state, seed);
    await writeSettlement(roomId, matchId, handId, settlement);
    await writeFinalizeOk(roomId, matchId, { handIds: [handId] });
    await indexJournals();

    const replay = await replayHand(handId);
    assert.equal(replay.ok, true, JSON.stringify(replay.mismatch));
    assert.equal(result.type, "handEnd");
  });
});

describe("serial queue + sanitize + reconnect binding", () => {
  it("processes concurrent enqueued actions serially", async () => {
    const room = createRoom("owner", "Owner");
    lockSeat(room, "owner", 0);
    confirmSeat(room, "owner", "Owner", 0);
    lockSeat(room, "u2", 1);
    confirmSeat(room, "u2", "P2", 1);
    room.seats[0].stack = 500;
    room.seats[1].stack = 500;
    room.roomState = "inMatch";

    const runtime = new MatchRuntime(room, () => {}, () => {});
    runtime.startMatch();
    const state = runtime.handState;
    const actor = state.seats[state.turnIndex];
    const turnId = state.turnId;

    const results = await Promise.all([
      runtime.enqueue({
        type: "game.action",
        userId: actor.userId,
        payload: {
          handId: runtime.handId,
          turnId,
          clientActionId: "c1",
          action: "fold",
        },
      }),
      runtime.enqueue({
        type: "game.action",
        userId: actor.userId,
        payload: {
          handId: runtime.handId,
          turnId,
          clientActionId: "c2",
          action: "fold",
        },
      }),
    ]);

    assert.equal(results[0].ok, true);
    assert.ok(results[0].seq === 0);
    assert.ok(results[1].seq === 1);
    runtime.clearLifecycleTimers();
    runtime.state = "destroyed";
  });

  it("rejects reconnect with wrong matchId when match active", () => {
    const room = createRoom("owner2", "Owner");
    lockSeat(room, "owner2", 0);
    const conf = confirmSeat(room, "owner2", "Owner", 0);
    room.matchId = "match_abc";
    const bad = validateReconnect(room, "owner2", 0, conf.reconnectToken, "match_other");
    assert.equal(bad.code, "MATCH_NOT_FOUND");
    const good = validateReconnect(room, "owner2", 0, conf.reconnectToken, "match_abc");
    assert.equal(good.ok, true);
  });

  it("sanitize strips hole cards and deckSeed from logs", async () => {
    const { sanitizeForLog } = await import("../src/logging/sanitize.js");
    const cleaned = sanitizeForLog({
      holeCards: [{ rank: "A", suit: "s" }],
      deckSeed: "secret",
      pot: 10,
    });
    assert.equal(cleaned.holeCards, "[REDACTED]");
    assert.equal(cleaned.deckSeed, "[REDACTED]");
    assert.equal(cleaned.pot, 10);
  });
});

describe("acceptance gaps", () => {
  it("keeps legal owner and sets actingOwner when owner leaves lobby", () => {
    const room = createRoom("ownerA", "A");
    lockSeat(room, "ownerA", 0);
    confirmSeat(room, "ownerA", "A", 0);
    lockSeat(room, "userB", 1);
    confirmSeat(room, "userB", "B", 1);
    assert.equal(room.ownerId, "ownerA");
    leaveRoom(room, "ownerA");
    assert.equal(room.ownerId, "ownerA");
    assert.equal(room.actingOwnerId, "userB");
    assert.equal(effectiveOwnerId(room), "userB");
  });

  it("transferOwner permanently changes ownerId", () => {
    const room = createRoom("ownerA", "A");
    lockSeat(room, "ownerA", 0);
    confirmSeat(room, "ownerA", "A", 0);
    lockSeat(room, "userB", 1);
    confirmSeat(room, "userB", "B", 1);
    const r = transferOwner(room, "ownerA", "userB");
    assert.equal(r.ok, true);
    assert.equal(room.ownerId, "userB");
    assert.equal(room.actingOwnerId, null);
  });

  it("creates 9 seats and supports add/remove bots", () => {
    const room = createRoom("owner", "O");
    assert.equal(room.seats.length, 9);
    lockSeat(room, "owner", 0);
    confirmSeat(room, "owner", "O", 0);
    const a1 = addBotSeat(room);
    assert.equal(a1.ok, true);
    assert.equal(room.seats[a1.seatIndex].isBot, true);
    assert.equal(room.seats[a1.seatIndex].ready, true);
    setReady(room, "owner", true);
    assert.equal(allReady(room), true);
    const rm = removeOneBotSeat(room);
    assert.equal(rm.ok, true);
    finalizeRemoveBot(room, rm.seatIndex);
    assert.equal(room.seats[rm.seatIndex].status, "empty");
  });

  it("abuse ban blocks game.action path via isAbuseBanned", () => {
    resetRateLimits();
    const uid = "abuse_user_" + Date.now();
    forceAbuseBan(uid, 60_000);
    assert.equal(isAbuseBanned(uid), true);
    resetRateLimits();
    assert.equal(isAbuseBanned(uid), false);
  });

  it("limits room.join by IP", () => {
    resetRateLimits();
    const ip = "203.0.113." + (Date.now() % 200);
    let blocked = false;
    for (let i = 0; i < 40; i += 1) {
      const r = checkIpRateLimit(ip, "ip.room.join");
      if (!r.ok) blocked = true;
    }
    assert.equal(blocked, true);
    resetRateLimits();
  });

  it("noteReconnect shortens next action timeout", async () => {
    const room = createRoom("o3", "O");
    lockSeat(room, "o3", 0);
    confirmSeat(room, "o3", "O", 0);
    lockSeat(room, "p3", 1);
    confirmSeat(room, "p3", "P", 1);
    room.seats[0].stack = 500;
    room.seats[1].stack = 500;
    const runtime = new MatchRuntime(room, () => {}, () => {});
    runtime.startMatch();
    const actor = runtime.handState.seats[runtime.handState.turnIndex];
    const prev = config.actionTimeoutMs;
    const prevShort = config.reconnectActionTimeoutMs;
    config.actionTimeoutMs = 50_000;
    config.reconnectActionTimeoutMs = 30;
    runtime.noteReconnect(actor.userId);
    assert.equal(runtime.reconnectTimeoutByUser.get(actor.userId), 30);
    // Wait for shortened autoAction
    await new Promise((r) => setTimeout(r, 80));
    assert.ok(runtime.handState.finished || runtime.handState.turnId > 1);
    config.actionTimeoutMs = prev;
    config.reconnectActionTimeoutMs = prevShort;
    runtime.clearLifecycleTimers();
    runtime.state = "destroyed";
  });

  it("auto-starts next hand after handEnd without manual startHand", async () => {
    const room = createRoom("o5", "O");
    lockSeat(room, "o5", 0);
    confirmSeat(room, "o5", "O", 0);
    lockSeat(room, "p5", 1);
    confirmSeat(room, "p5", "P", 1);
    room.seats[0].stack = 500;
    room.seats[1].stack = 500;
    const runtime = new MatchRuntime(room, () => {}, () => {});
    runtime.startMatch();
    const hand1 = runtime.handId;
    const actor = runtime.handState.seats[runtime.handState.turnIndex];
    await runtime.enqueue({
      type: "game.action",
      userId: actor.userId,
      payload: {
        handId: runtime.handId,
        turnId: runtime.handState.turnId,
        clientActionId: "fold_auto_next",
        action: "fold",
      },
    });
    assert.equal(runtime.handState.finished, true);
    await new Promise((r) => setTimeout(r, 1600));
    assert.equal(runtime.state, "active");
    assert.ok(runtime.handId);
    assert.notEqual(runtime.handId, hand1);
    assert.equal(runtime.handState.finished, false);
    runtime.clearLifecycleTimers();
    runtime.state = "destroyed";
  });

  it("rotates dealer across consecutive hands", async () => {
    const room = createRoom("o4", "O");
    lockSeat(room, "o4", 0);
    confirmSeat(room, "o4", "O", 0);
    lockSeat(room, "p4", 1);
    confirmSeat(room, "p4", "P", 1);
    room.seats[0].stack = 500;
    room.seats[1].stack = 500;
    const runtime = new MatchRuntime(room, () => {}, () => {});
    runtime.startMatch();
    const d1 = runtime.dealerIndex;
    const v1End = runtime.handState.matchVersion;
    const actor = runtime.handState.seats[runtime.handState.turnIndex];
    await runtime.enqueue({
      type: "game.action",
      userId: actor.userId,
      payload: {
        handId: runtime.handId,
        turnId: runtime.handState.turnId,
        clientActionId: "fold_h1",
        action: "fold",
      },
    });
    const versionAfterHand1 = runtime.handState.matchVersion;
    assert.ok(versionAfterHand1 >= v1End);
    // Wait for next-hand timer (1500ms unref — force startHand)
    runtime.clearLifecycleTimers();
    if (runtime.state === "active") runtime.startHand();
    const d2 = runtime.dealerIndex;
    assert.notEqual(d1, d2);
    // Next hand must not reset matchVersion to 1 (clients treat that as stale).
    assert.ok(
      runtime.handState.matchVersion > versionAfterHand1,
      `expected matchVersion > ${versionAfterHand1}, got ${runtime.handState.matchVersion}`,
    );
    runtime.clearLifecycleTimers();
    runtime.state = "destroyed";
  });

  it("query settlement after destroy via journal files", async () => {
    const roomId = "room_q";
    const matchId = "match_q";
    const handId = "hand_q_" + Date.now();
    const seats = [
      { seatIndex: 0, userId: "u_q1", displayName: "A", stack: 500, status: "occupied" },
      { seatIndex: 1, userId: "u_q2", displayName: "B", stack: 500, status: "occupied" },
    ];
    const seed = newHandSeed();
    const { state, positions } = createHandState(seats, 0, handId, seed);
    setFirstActor(state, positions.bigBlindIndex);
    applyFold(state, state.turnIndex);
    await initHandJournal(roomId, matchId, handId, {
      handId,
      roomId,
      matchId,
      participants: seats.map((s) => ({ userId: s.userId, seatIndex: s.seatIndex })),
      deckSeed: seed,
      startedAt: Date.now(),
    });
    const settlement = buildSettlement(state, seed);
    await writeSettlement(roomId, matchId, handId, settlement);
    await writeFinalizeOk(roomId, matchId, { handIds: [handId] });
    await indexJournals();

    // Simulate destroyed match: only disk remains
    destroyMatch("nonexistent");
    const read = await readSettlement(handId);
    assert.ok(read);
    assert.equal(read.handId, handId);
    assert.equal(await userParticipated(handId, "u_q1"), true);
    assert.equal(await userParticipated(handId, "stranger"), false);
  });

  it("kickConnection emits session.kicked then closes", () => {
    const messages = [];
    const ws = {
      readyState: 1,
      send: (raw) => messages.push(JSON.parse(raw)),
      close: () => {
        ws.readyState = 3;
      },
    };
    const connId = registerConnection(ws, "kick_me", "");
    kickConnection(connId, "kick_me", "session_expired");
    assert.equal(messages[0]?.type, "session.kicked");
    assert.equal(messages[0]?.reason, "session_expired");
    assert.equal(getConnection(connId), undefined);
  });

  it("duplicate connection kicks old socket", () => {
    const msgsA = [];
    const wsA = {
      readyState: 1,
      send: (raw) => msgsA.push(JSON.parse(raw)),
      close: () => {
        wsA.readyState = 3;
      },
    };
    const wsB = {
      readyState: 1,
      send: () => {},
      close: () => {
        wsB.readyState = 3;
      },
    };
    const idA = registerConnection(wsA, "dup_user", "");
    registerConnection(wsB, "dup_user", "");
    assert.equal(msgsA[0]?.type, "session.kicked");
    assert.equal(msgsA[0]?.reason, "duplicate_connection");
    assert.equal(getConnection(idA), undefined);
    assert.equal(activeUserConn.get("dup_user") != null, true);
  });

  it("keeps empty room until idle TTL then sweeps", () => {
    const room = createRoom("solo_idle", "Solo");
    lockSeat(room, "solo_idle", 0);
    confirmSeat(room, "solo_idle", "Solo", 0);
    leaveRoom(room, "solo_idle");
    assert.equal(rooms.has(room.roomId), true);
    assert.equal(room.roomState, "seatingOpen");
    assert.equal(sweepIdleEmptyRooms(Date.now()).includes(room.roomId), false);
    const swept = sweepIdleEmptyRooms(Date.now() + config.roomIdleTtlMs + 1);
    assert.equal(swept.includes(room.roomId), true);
    assert.equal(rooms.has(room.roomId), false);
  });

  it("does not sweep rooms that still have seated players", () => {
    const room = createRoom("kept", "K");
    lockSeat(room, "kept", 0);
    confirmSeat(room, "kept", "K", 0);
    const swept = sweepIdleEmptyRooms(Date.now() + config.roomIdleTtlMs + 1);
    assert.equal(swept.includes(room.roomId), false);
    destroyRoom(room);
  });
});
