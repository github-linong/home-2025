const PLAYERS = ["player", "ai"];

export function otherPlayer(player) {
  if (!PLAYERS.includes(player)) throw new RangeError("Unknown player.");
  return player === "player" ? "ai" : "player";
}

export function blindPositions(dealer) {
  return {
    smallBlind: dealer,
    bigBlind: otherPlayer(dealer),
  };
}

export function firstToAct(dealer, street) {
  return street === "preflop" ? dealer : otherPlayer(dealer);
}

export function getRaiseBounds({
  player,
  stacks,
  streetBets,
  currentBet,
  lastRaise,
}) {
  const callAmount = Math.max(0, currentBet - streetBets[player]);
  const maximum = streetBets[player] + stacks[player];
  const minimum = currentBet === 0 ? lastRaise : currentBet + lastRaise;

  return {
    callAmount: Math.min(callAmount, stacks[player]),
    fullCallAmount: callAmount,
    minimum,
    maximum,
    canRaise: maximum > currentBet,
    canFullRaise: maximum >= minimum,
  };
}

export function settleUncalledBets(totalBets) {
  const matched = Math.min(totalBets.player, totalBets.ai);
  return {
    contestedPot: matched * 2,
    refunds: {
      player: totalBets.player - matched,
      ai: totalBets.ai - matched,
    },
  };
}

export function nextSeatIndex(seats, fromIndex, predicate = (_seat, _index) => true) {
  if (!Array.isArray(seats) || seats.length === 0) {
    throw new RangeError("At least one seat is required.");
  }

  for (let offset = 1; offset <= seats.length; offset += 1) {
    const index = (fromIndex + offset) % seats.length;
    if (predicate(seats[index], index)) return index;
  }

  return -1;
}

export function tablePositions(seats, dealerIndex) {
  const hasChips = (seat) => seat.stack > 0;
  const activeCount = seats.filter(hasChips).length;
  if (activeCount === 2) {
    const bigBlindIndex = nextSeatIndex(seats, dealerIndex, hasChips);
    return {
      dealerIndex,
      smallBlindIndex: dealerIndex,
      bigBlindIndex,
      preflopFirstIndex: dealerIndex,
      postflopFirstIndex: bigBlindIndex,
    };
  }

  const smallBlindIndex = nextSeatIndex(seats, dealerIndex, hasChips);
  const bigBlindIndex = nextSeatIndex(seats, smallBlindIndex, hasChips);

  return {
    dealerIndex,
    smallBlindIndex,
    bigBlindIndex,
    preflopFirstIndex: nextSeatIndex(seats, bigBlindIndex, hasChips),
    postflopFirstIndex: nextSeatIndex(seats, dealerIndex, hasChips),
  };
}

export function createSidePots(seats) {
  const levels = [...new Set(
    seats
      .map((seat) => seat.totalBet)
      .filter((amount) => amount > 0),
  )].sort((a, b) => a - b);
  const pots = [];
  let previousLevel = 0;

  for (const level of levels) {
    const contributors = seats.filter((seat) => seat.totalBet >= level);
    const amount = (level - previousLevel) * contributors.length;
    const eligibleIds = contributors
      .filter((seat) => !seat.folded)
      .map((seat) => seat.id);

    if (amount > 0) pots.push({ amount, eligibleIds });
    previousLevel = level;
  }

  return pots;
}
