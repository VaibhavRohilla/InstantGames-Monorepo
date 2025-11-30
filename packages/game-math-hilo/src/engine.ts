import {
  Card,
  CompareResult,
  DEFAULT_SUIT_ORDER,
  GuessDirection,
  GuessOutcome,
  HiloCompareConfig,
  HiloConfig,
  HiloRoundState,
  Suit,
} from "./types";

const MIN_RANK = 2;
const MAX_RANK = 14;

interface NormalizedConfig {
  maxSteps: number;
  multipliers: number[];
  suitOrder: Suit[];
}

export function startRound(deck: Card[], baseBet: number, config: HiloConfig): HiloRoundState {
  const normalizedConfig = normalizeConfig(config);
  if (!Array.isArray(deck) || deck.length < 2) {
    throw new Error("Hilo: deck must contain at least two cards");
  }
  if (!Number.isFinite(baseBet) || baseBet <= 0) {
    throw new Error("Hilo: baseBet must be a positive finite number");
  }

  const normalizedDeck = deck.map((card) => normalizeCard(card));

  return {
    deck: normalizedDeck,
    cursor: 0,
    currentCard: normalizedDeck[0],
    step: 0,
    baseBet,
    totalMultiplier: 1,
    finished: false,
  };
}

export function applyGuess(state: HiloRoundState, direction: GuessDirection, config: HiloConfig): GuessOutcome {
  if (state.finished) {
    throw new Error("Hilo: round already finished");
  }
  assertState(state);

  const normalizedConfig = normalizeConfig(config);
  const nextCursor = state.cursor + 1;
  if (nextCursor >= state.deck.length) {
    throw new Error("Hilo: deck exhausted");
  }

  const nextCard = state.deck[nextCursor];
  const comparison = compareCards(nextCard, state.currentCard, { suitOrder: normalizedConfig.suitOrder });

  const didWin =
    (direction === "higher" && comparison.cmp === 1) || (direction === "lower" && comparison.cmp === -1);

  let nextStep = state.step;
  let totalMultiplier = state.totalMultiplier;
  let finished = false;

  if (didWin) {
    nextStep += 1;
    const cappedStep = Math.min(nextStep, normalizedConfig.maxSteps);
    totalMultiplier = normalizedConfig.multipliers[cappedStep - 1] ?? totalMultiplier;
    nextStep = cappedStep;
    finished = nextStep >= normalizedConfig.maxSteps;
  } else {
    finished = true;
  }

  const nextState: HiloRoundState = {
    ...state,
    cursor: nextCursor,
    currentCard: nextCard,
    step: nextStep,
    totalMultiplier,
    finished,
  };

  return {
    state: nextState,
    nextCard,
    result: didWin ? "win" : "lose",
    totalMultiplier,
    step: nextStep,
    sameRankDifferentSuit: comparison.sameRankDifferentSuit,
  };
}

export function getCashoutAmount(state: HiloRoundState): number {
  if (state.step === 0) {
    return 0;
  }
  return state.baseBet * state.totalMultiplier;
}

export function markCashout(state: HiloRoundState): HiloRoundState {
  if (state.finished) {
    return state;
  }
  return {
    ...state,
    finished: true,
  };
}

export function compareCards(a: Card, b: Card, config: HiloCompareConfig = {}): CompareResult {
  const suitOrder = normalizeSuitOrder(config.suitOrder ?? DEFAULT_SUIT_ORDER);
  const suitRank = new Map<Suit, number>();
  suitOrder.forEach((suit, idx) => suitRank.set(suit, idx));

  const left = normalizeCard(a);
  const right = normalizeCard(b);

  if (left.rank > right.rank) {
    return { cmp: 1, sameRankDifferentSuit: false };
  }
  if (left.rank < right.rank) {
    return { cmp: -1, sameRankDifferentSuit: false };
  }
  if (left.suit === right.suit) {
    return { cmp: 0, sameRankDifferentSuit: false };
  }

  const leftSuitRank = suitRank.get(left.suit);
  const rightSuitRank = suitRank.get(right.suit);
  if (leftSuitRank === undefined || rightSuitRank === undefined) {
    throw new Error("Hilo: invalid suit order comparison");
  }

  return {
    cmp: leftSuitRank > rightSuitRank ? 1 : -1,
    sameRankDifferentSuit: true,
  };
}

function normalizeConfig(config: HiloConfig): NormalizedConfig {
  if (!Number.isFinite(config.maxSteps) || config.maxSteps <= 0) {
    throw new Error("Hilo: maxSteps must be a positive finite number");
  }
  if (!Array.isArray(config.multipliers) || config.multipliers.length === 0) {
    throw new Error("Hilo: multipliers must be a non-empty array");
  }
  const maxSteps = Math.floor(config.maxSteps);
  if (config.multipliers.length < maxSteps) {
    throw new Error("Hilo: multipliers array must cover every step up to maxSteps");
  }
  const multipliers = config.multipliers.map((value, idx) => {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Hilo: multiplier at index ${idx} must be a positive finite number`);
    }
    return value;
  });

  const suitOrder = normalizeSuitOrder(config.suitOrder ?? DEFAULT_SUIT_ORDER);

  return {
    maxSteps,
    multipliers,
    suitOrder,
  };
}

function normalizeSuitOrder(order: Suit[]): Suit[] {
  if (!Array.isArray(order) || order.length !== DEFAULT_SUIT_ORDER.length) {
    throw new Error("Hilo: suitOrder must contain exactly four suits");
  }
  const seen = new Set<Suit>();
  for (const suit of order) {
    if (!DEFAULT_SUIT_ORDER.includes(suit)) {
      throw new Error(`Hilo: invalid suit '${suit}' in suitOrder`);
    }
    if (seen.has(suit)) {
      throw new Error("Hilo: suitOrder must not contain duplicates");
    }
    seen.add(suit);
  }
  return [...order];
}

function normalizeCard(card: Card): Card {
  if (typeof card !== "object" || card == null) {
    throw new Error("Hilo: card must be an object");
  }
  const rank = Number(card.rank);
  if (!Number.isFinite(rank) || rank < MIN_RANK || rank > MAX_RANK) {
    throw new Error("Hilo: card rank must be between 2 and 14");
  }
  const intRank = Math.trunc(rank);
  if (!DEFAULT_SUIT_ORDER.includes(card.suit)) {
    throw new Error("Hilo: card suit must be a valid suit value");
  }
  return {
    rank: intRank,
    suit: card.suit,
  };
}

function assertState(state: HiloRoundState): void {
  if (!Array.isArray(state.deck) || state.deck.length === 0) {
    throw new Error("Hilo: invalid round state deck");
  }
  if (state.cursor < 0 || state.cursor >= state.deck.length) {
    throw new Error("Hilo: round cursor out of bounds");
  }
  const expectedCurrent = state.deck[state.cursor];
  if (!cardsEqual(expectedCurrent, state.currentCard)) {
    throw new Error("Hilo: currentCard mismatch");
  }
}

function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}


