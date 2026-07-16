import assert from "node:assert/strict";
import test from "node:test";

import {
  blindPositions,
  createSidePots,
  firstToAct,
  getRaiseBounds,
  nextSeatIndex,
  otherPlayer,
  settleUncalledBets,
  tablePositions,
} from "../src/lib/pokerBetting.mjs";

test("alternates between heads-up players", () => {
  assert.equal(otherPlayer("player"), "ai");
  assert.equal(otherPlayer("ai"), "player");
  assert.throws(() => otherPlayer("third-player"), RangeError);
});

test("assigns the dealer to the small blind", () => {
  assert.deepEqual(blindPositions("player"), {
    smallBlind: "player",
    bigBlind: "ai",
  });
  assert.deepEqual(blindPositions("ai"), {
    smallBlind: "ai",
    bigBlind: "player",
  });
});

test("uses correct heads-up action order", () => {
  assert.equal(firstToAct("player", "preflop"), "player");
  assert.equal(firstToAct("player", "flop"), "ai");
  assert.equal(firstToAct("ai", "turn"), "player");
});

test("calculates no-limit raise bounds", () => {
  const bounds = getRaiseBounds({
    player: "player",
    stacks: { player: 495, ai: 490 },
    streetBets: { player: 5, ai: 10 },
    currentBet: 10,
    lastRaise: 10,
  });

  assert.deepEqual(bounds, {
    callAmount: 5,
    fullCallAmount: 5,
    minimum: 20,
    maximum: 500,
    canRaise: true,
    canFullRaise: true,
  });
});

test("allows a short all-in without calling it a full raise", () => {
  const bounds = getRaiseBounds({
    player: "player",
    stacks: { player: 12, ai: 100 },
    streetBets: { player: 0, ai: 10 },
    currentBet: 10,
    lastRaise: 10,
  });

  assert.equal(bounds.minimum, 20);
  assert.equal(bounds.maximum, 12);
  assert.equal(bounds.canRaise, true);
  assert.equal(bounds.canFullRaise, false);
});

test("caps a short all-in call at the remaining stack", () => {
  const bounds = getRaiseBounds({
    player: "ai",
    stacks: { player: 100, ai: 7 },
    streetBets: { player: 30, ai: 10 },
    currentBet: 30,
    lastRaise: 20,
  });

  assert.equal(bounds.fullCallAmount, 20);
  assert.equal(bounds.callAmount, 7);
});

test("returns unmatched heads-up chips before showdown", () => {
  assert.deepEqual(settleUncalledBets({ player: 500, ai: 180 }), {
    contestedPot: 360,
    refunds: { player: 320, ai: 0 },
  });
});

test("assigns six-player blinds and action order clockwise", () => {
  const seats = Array.from({ length: 6 }, (_, index) => ({
    id: `seat-${index}`,
    stack: 500,
  }));

  assert.deepEqual(tablePositions(seats, 4), {
    dealerIndex: 4,
    smallBlindIndex: 5,
    bigBlindIndex: 0,
    preflopFirstIndex: 1,
    postflopFirstIndex: 5,
  });
});

test("switches to heads-up blind and action rules with two players left", () => {
  const seats = [
    { id: "player", stack: 500 },
    { id: "out-1", stack: 0 },
    { id: "ai", stack: 500 },
    { id: "out-2", stack: 0 },
  ];

  assert.deepEqual(tablePositions(seats, 0), {
    dealerIndex: 0,
    smallBlindIndex: 0,
    bigBlindIndex: 2,
    preflopFirstIndex: 0,
    postflopFirstIndex: 2,
  });
});

test("skips seats that cannot participate", () => {
  const seats = [
    { id: "a", stack: 100 },
    { id: "b", stack: 0 },
    { id: "c", stack: 100 },
  ];

  assert.equal(nextSeatIndex(seats, 0, (seat) => seat.stack > 0), 2);
  assert.equal(nextSeatIndex(seats, 2, (seat) => seat.stack > 0), 0);
});

test("builds main and side pots while excluding folded players from winning", () => {
  const pots = createSidePots([
    { id: "player", totalBet: 100, folded: false },
    { id: "ai-1", totalBet: 300, folded: false },
    { id: "ai-2", totalBet: 300, folded: true },
    { id: "ai-3", totalBet: 500, folded: false },
  ]);

  assert.deepEqual(pots, [
    {
      amount: 400,
      eligibleIds: ["player", "ai-1", "ai-3"],
    },
    {
      amount: 600,
      eligibleIds: ["ai-1", "ai-3"],
    },
    {
      amount: 200,
      eligibleIds: ["ai-3"],
    },
  ]);
  assert.equal(pots.reduce((sum, pot) => sum + pot.amount, 0), 1200);
});
