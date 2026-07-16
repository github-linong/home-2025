import { compareScores, evaluateBestHand } from "../core/pokerEngine.mjs";
import {
  createSidePots,
  nextSeatIndex,
  settleUncalledBetsMulti,
  tablePositions,
} from "../core/pokerBetting.mjs";
import { createSeededDeck, generateDeckSeed } from "../core/ids.js";
import { config } from "../config.js";

export function createEmptySeats(seatCount = 9) {
  return Array.from({ length: seatCount }, (_, index) => ({
    seatIndex: index,
    userId: null,
    displayName: null,
    stack: 0,
    hole: [],
    streetBet: 0,
    totalBet: 0,
    folded: true,
    allIn: false,
    acted: false,
    status: "empty",
    ready: false,
    isBot: false,
    leaveAfterHand: false,
  }));
}

export function getRaiseBounds(state, seatIndex) {
  const seat = state.seats[seatIndex];
  if (!seat) throw new RangeError("Invalid seat");
  const fullCallAmount = Math.max(0, state.currentBet - seat.streetBet);
  const maximum = seat.streetBet + seat.stack;
  const minimum =
    state.currentBet === 0 ? state.lastRaise : state.currentBet + state.lastRaise;
  return {
    callAmount: Math.min(fullCallAmount, seat.stack),
    fullCallAmount,
    minimum,
    maximum,
    canRaise: maximum > state.currentBet,
    canFullRaise: maximum >= minimum,
  };
}

function canAct(seat) {
  return seat.hole.length > 0 && !seat.folded && !seat.allIn && seat.stack >= 0;
}

function needsAction(seat, state) {
  return canAct(seat) && (!seat.acted || seat.streetBet < state.currentBet);
}

function contenders(state) {
  return state.seats.filter((s) => s.hole.length > 0 && !s.folded);
}

function drawCard(state) {
  const card = state.deck.pop();
  if (!card) throw new Error("Empty deck");
  return card;
}

function commit(state, seat, amount) {
  const paid = Math.min(Math.max(0, amount), seat.stack);
  seat.stack -= paid;
  seat.streetBet += paid;
  seat.totalBet += paid;
  seat.allIn = seat.stack === 0;
  state.pot += paid;
  state.currentBet = Math.max(state.currentBet, seat.streetBet);
  return paid;
}

export function snapshotSummary(state) {
  return {
    street: state.street,
    pot: state.pot,
    currentBet: state.currentBet,
    matchVersion: state.matchVersion,
    seats: state.seats.map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      stack: s.stack,
      streetBet: s.streetBet,
      totalBet: s.totalBet,
      folded: s.folded,
      allIn: s.allIn,
      status: s.status,
    })),
  };
}

export function createHandState(seats, dealerIndex, handId, deckSeed, opts = {}) {
  const activeSeats = seats.filter((s) => s.userId && s.stack > 0);
  const initialMatchVersion =
    typeof opts.initialMatchVersion === "number" && opts.initialMatchVersion > 0
      ? opts.initialMatchVersion
      : 1;
  const state = {
    handId,
    deckSeed,
    deck: createSeededDeck(deckSeed),
    seats: activeSeats.map((s) => ({
      ...s,
      id: s.userId,
      hole: [],
      streetBet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      acted: false,
    })),
    community: [],
    dealerIndex,
    turnIndex: -1,
    turnId: 0,
    street: "preflop",
    currentBet: 0,
    lastRaise: config.bb,
    pot: 0,
    finished: false,
    reveal: false,
    raiseLockedIds: [],
    // Monotonic across hands within a match so clients don't drop the next hand as "stale".
    matchVersion: initialMatchVersion,
    message: "",
    sidePots: [],
  };

  const positions = tablePositions(state.seats, dealerIndex);
  dealHoleCards(state, positions.smallBlindIndex);
  commit(state, state.seats[positions.smallBlindIndex], config.sb);
  commit(state, state.seats[positions.bigBlindIndex], config.bb);

  return { state, positions };
}

function dealHoleCards(state, startIndex) {
  for (let round = 0; round < 2; round += 1) {
    let index = startIndex;
    for (let dealt = 0; dealt < state.seats.length; dealt += 1) {
      const seat = state.seats[index];
      if (seat.stack > 0 || seat.streetBet > 0) seat.hole.push(drawCard(state));
      index = (index + 1) % state.seats.length;
    }
  }
}

function firstActionableAfter(state, index) {
  return nextSeatIndex(state.seats, index, (seat) => canAct(seat));
}

function nextNeedingAction(state, index) {
  return nextSeatIndex(state.seats, index, (seat) => needsAction(seat, state));
}

export function setFirstActor(state, afterIndex) {
  const first = firstActionableAfter(state, afterIndex);
  if (first === -1) return { runout: true };
  state.turnIndex = first;
  state.turnId += 1;
  return { runout: false, actorSeatIndex: first };
}

export function applyFold(state, seatIndex) {
  const seat = state.seats[seatIndex];
  seat.folded = true;
  seat.acted = true;
  state.matchVersion += 1;
  return advanceAfterAction(state, seatIndex);
}

/**
 * Fold a seat even when it is not the current actor (kick / voluntary leave).
 * Does not refund pot contributions. All-in seats are left untouched.
 */
export function forceFoldSeat(state, seatIndex) {
  const seat = state.seats[seatIndex];
  if (!seat || seat.folded) return { type: "noop" };
  if (seat.allIn) return { type: "noop", allIn: true };

  if (state.turnIndex === seatIndex) {
    return applyFold(state, seatIndex);
  }

  seat.folded = true;
  seat.acted = true;
  state.matchVersion += 1;

  const remaining = contenders(state);
  if (remaining.length === 1) {
    return finishByFolds(state, remaining[0]);
  }
  if (!state.seats.some((s) => needsAction(s, state))) {
    const actionable = remaining.filter(canAct);
    if (actionable.length <= 1) {
      return runoutBoard(state);
    }
    return advanceStreet(state);
  }
  return { type: "folded", actorSeatIndex: state.turnIndex };
}

export function applyCheckOrCall(state, seatIndex) {
  const seat = state.seats[seatIndex];
  const required = Math.max(0, state.currentBet - seat.streetBet);
  const paid = commit(state, seat, required);
  seat.acted = true;
  state.matchVersion += 1;
  return { paid, required, ...advanceAfterAction(state, seatIndex) };
}

export function applyRaise(state, seatIndex, target, allIn = false) {
  const seat = state.seats[seatIndex];
  const bounds = getRaiseBounds(state, seatIndex);
  const normalizedTarget = Math.floor(target);
  const shortRaise =
    normalizedTarget > state.currentBet && normalizedTarget < bounds.minimum;
  const legal =
    normalizedTarget > state.currentBet &&
    normalizedTarget <= bounds.maximum &&
    (normalizedTarget >= bounds.minimum || (allIn && normalizedTarget === bounds.maximum));

  if (!legal || state.raiseLockedIds.includes(seat.userId)) {
    return { ok: false, reason: "INVALID_ACTION" };
  }

  const previousBet = state.currentBet;
  const previouslyActed = state.seats.filter(
    (other) => other.userId !== seat.userId && other.acted,
  );
  commit(state, seat, normalizedTarget - seat.streetBet);
  const raiseSize = state.currentBet - previousBet;
  seat.acted = true;

  if (shortRaise) {
    state.raiseLockedIds = previouslyActed.map((o) => o.userId);
  } else {
    state.lastRaise = raiseSize;
    state.raiseLockedIds = [];
    for (const other of state.seats) {
      if (other.userId !== seat.userId && canAct(other)) other.acted = false;
    }
  }

  state.matchVersion += 1;
  return { ok: true, ...advanceAfterAction(state, seatIndex) };
}

function advanceAfterAction(state, fromIndex) {
  const remaining = contenders(state);
  if (remaining.length === 1) {
    return finishByFolds(state, remaining[0]);
  }

  if (!state.seats.some((s) => needsAction(s, state))) {
    const actionable = remaining.filter(canAct);
    if (actionable.length <= 1) {
      return runoutBoard(state);
    }
    return advanceStreet(state);
  }

  const next = nextNeedingAction(state, fromIndex);
  state.turnIndex = next;
  state.turnId += 1;
  return { type: "turn", actorSeatIndex: next };
}

function finishByFolds(state, winner) {
  settleUncalledBetsMulti(state.seats, state);
  winner.stack += state.pot;
  state.pot = 0;
  state.finished = true;
  state.turnIndex = -1;
  state.matchVersion += 1;
  return {
    type: "handEnd",
    reason: "folds",
    winners: [{ userId: winner.userId, seatIndex: winner.seatIndex, amount: 0 }],
  };
}

function runoutBoard(state) {
  if (state.community.length === 0) {
    state.community.push(drawCard(state), drawCard(state), drawCard(state));
  }
  while (state.community.length < 5) state.community.push(drawCard(state));
  state.reveal = true;
  state.matchVersion += 1;
  return showdown(state);
}

function advanceStreet(state) {
  if (state.street === "river") {
    state.reveal = true;
    return showdown(state);
  }

  if (state.street === "preflop") {
    state.street = "flop";
    state.community.push(drawCard(state), drawCard(state), drawCard(state));
  } else if (state.street === "flop") {
    state.street = "turn";
    state.community.push(drawCard(state));
  } else {
    state.street = "river";
    state.community.push(drawCard(state));
  }

  for (const seat of state.seats) {
    seat.streetBet = 0;
    seat.acted = false;
  }
  state.currentBet = 0;
  state.lastRaise = config.bb;
  state.raiseLockedIds = [];
  state.matchVersion += 1;

  const actionable = contenders(state).filter(canAct);
  if (actionable.length <= 1) return runoutBoard(state);

  const first = firstActionableAfter(state, state.dealerIndex);
  state.turnIndex = first;
  state.turnId += 1;
  return { type: "street", street: state.street, actorSeatIndex: first };
}

function showdown(state) {
  state.reveal = true;
  settleUncalledBetsMulti(state.seats, state);
  const pots = createSidePots(state.seats);
  state.sidePots = pots;
  const winnings = new Map();

  for (const pot of pots) {
    const eligible = state.seats.filter((s) => pot.eligibleIds.includes(s.userId));
    if (eligible.length === 0) continue;

    let bestScore = null;
    let winners = [];
    for (const seat of eligible) {
      const score = evaluateBestHand([...seat.hole, ...state.community]).score;
      const comparison = bestScore ? compareScores(score, bestScore) : 1;
      if (comparison > 0) {
        bestScore = score;
        winners = [seat];
      } else if (comparison === 0) {
        winners.push(seat);
      }
    }

    const orderedWinners = [...winners].sort((a, b) => {
      const leftDistance =
        (a.seatIndex - state.dealerIndex + state.seats.length) % state.seats.length;
      const rightDistance =
        (b.seatIndex - state.dealerIndex + state.seats.length) % state.seats.length;
      return leftDistance - rightDistance;
    });

    const share = Math.floor(pot.amount / orderedWinners.length);
    let remainder = pot.amount % orderedWinners.length;
    for (const winner of orderedWinners) {
      const award = share + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      winner.stack += award;
      winnings.set(winner.userId, (winnings.get(winner.userId) ?? 0) + award);
    }
  }

  state.pot = 0;
  state.finished = true;
  state.turnIndex = -1;
  state.matchVersion += 1;

  const winnerList = [...winnings.entries()].map(([userId, amount]) => {
    const seat = state.seats.find((s) => s.userId === userId);
    return { userId, seatIndex: seat?.seatIndex, amount };
  });

  return { type: "handEnd", reason: "showdown", winners: winnerList, pots };
}

export function getLegalActions(state, seatIndex) {
  const seat = state.seats[seatIndex];
  if (!seat || state.finished || state.turnIndex !== seatIndex) {
    return { actions: [] };
  }
  const bounds = getRaiseBounds(state, seatIndex);
  const raiseLocked = state.raiseLockedIds.includes(seat.userId);
  const actions = ["fold"];
  if (bounds.fullCallAmount === 0) actions.push("check");
  else actions.push("call");
  if (!raiseLocked && bounds.canFullRaise) actions.push("raise");
  if (bounds.maximum > state.currentBet) actions.push("allin");
  return { actions, raiseBounds: bounds };
}

export function newHandSeed() {
  return generateDeckSeed();
}
