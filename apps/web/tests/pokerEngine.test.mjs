import assert from "node:assert/strict";
import test from "node:test";

import {
  compareHands,
  compareScores,
  createDeck,
  evaluateBestHand,
} from "../src/lib/pokerEngine.mjs";

function cards(notation) {
  return notation.split(" ").map((card) => ({
    rank: card[0],
    suit: card[1],
  }));
}

test("recognizes every hand category", () => {
  const examples = [
    ["As Kd 9c 6h 3s", "高牌"],
    ["As Ad 9c 6h 3s", "一对"],
    ["As Ad 9c 9h 3s", "两对"],
    ["As Ad Ac 6h 3s", "三条"],
    ["9s 8d 7c 6h 5s", "顺子"],
    ["As Js 9s 6s 3s", "同花"],
    ["As Ad Ac 6h 6s", "葫芦"],
    ["As Ad Ac Ah 3s", "四条"],
    ["9s 8s 7s 6s 5s", "同花顺"],
  ];

  for (const [notation, expected] of examples) {
    assert.equal(evaluateBestHand(cards(notation)).name, expected);
  }
});

test("finds the best five cards from seven", () => {
  const result = evaluateBestHand(cards("As Ks Qs Js Ts 2d 2c"));

  assert.equal(result.name, "同花顺");
  assert.deepEqual(result.score, [8, 14]);
});

test("recognizes an ace-low straight", () => {
  assert.deepEqual(evaluateBestHand(cards("As 2d 3c 4h 5s")).score, [4, 5]);
});

test("uses kickers to break equal categories", () => {
  const board = "Ah 7d 4c 3s 2h";
  const result = compareHands(cards(`Ac Kd ${board}`), cards(`Ad Qd ${board}`));

  assert.equal(result, 1);
});

test("returns a tie when the board is the best hand", () => {
  const board = "As Ks Qs Js Ts";
  const result = compareHands(cards(`2c 3d ${board}`), cards(`9c 9d ${board}`));

  assert.equal(result, 0);
});

test("compares score arrays deterministically", () => {
  assert.equal(compareScores([2, 14, 10, 9], [2, 14, 10, 8]), 1);
  assert.equal(compareScores([4, 8], [4, 9]), -1);
});

test("creates a complete deck without duplicates", () => {
  const deck = createDeck(() => 0.5);
  const uniqueCards = new Set(deck.map(({ rank, suit }) => `${rank}${suit}`));

  assert.equal(deck.length, 52);
  assert.equal(uniqueCards.size, 52);
});

test("rejects invalid hand sizes", () => {
  assert.throws(() => evaluateBestHand(cards("As Ks Qs Js")), RangeError);
  assert.throws(() => evaluateBestHand(cards("As Ks Qs Js Ts 9s 8s 7s")), RangeError);
});
