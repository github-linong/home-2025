export const SUITS = ["s", "h", "d", "c"];
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

const CATEGORY_NAMES = [
  "高牌",
  "一对",
  "两对",
  "三条",
  "顺子",
  "同花",
  "葫芦",
  "四条",
  "同花顺",
];

function rankValue(rank) {
  return RANKS.indexOf(rank) + 2;
}

function combinations(cards, size) {
  const result = [];

  function visit(start, selected) {
    if (selected.length === size) {
      result.push(selected);
      return;
    }

    for (let index = start; index <= cards.length - (size - selected.length); index += 1) {
      visit(index + 1, [...selected, cards[index]]);
    }
  }

  visit(0, []);
  return result;
}

function evaluateFive(cards) {
  const values = cards.map((card) => rankValue(card.rank)).sort((a, b) => b - a);
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const groups = [...counts.entries()].sort(
    ([valueA, countA], [valueB, countB]) => countB - countA || valueB - valueA,
  );
  const unique = [...new Set(values)];
  let straightHigh = 0;

  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) {
      straightHigh = unique[0];
    } else if (unique.join(",") === "14,5,4,3,2") {
      straightHigh = 5;
    }
  }

  const flush = cards.every((card) => card.suit === cards[0].suit);
  let score;

  if (flush && straightHigh) {
    score = [8, straightHigh];
  } else if (groups[0][1] === 4) {
    score = [7, groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    score = [6, groups[0][0], groups[1][0]];
  } else if (flush) {
    score = [5, ...values];
  } else if (straightHigh) {
    score = [4, straightHigh];
  } else if (groups[0][1] === 3) {
    score = [3, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    score = [2, ...pairs, groups[2][0]];
  } else if (groups[0][1] === 2) {
    score = [1, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  } else {
    score = [0, ...values];
  }

  return { category: score[0], name: CATEGORY_NAMES[score[0]], score, cards };
}

export function compareScores(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function evaluateBestHand(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
    throw new RangeError("A poker hand must contain between 5 and 7 cards.");
  }

  return combinations(cards, 5)
    .map(evaluateFive)
    .reduce((best, candidate) =>
      compareScores(candidate.score, best.score) > 0 ? candidate : best,
    );
}

export function compareHands(leftCards, rightCards) {
  return compareScores(evaluateBestHand(leftCards).score, evaluateBestHand(rightCards).score);
}

export function createDeck(random = Math.random) {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}
