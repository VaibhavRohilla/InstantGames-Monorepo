import { describe, expect, it } from "vitest";
import {
  applyGuess,
  compareCards,
  getCashoutAmount,
  markCashout,
  startRound,
  type Card,
  type HiloConfig,
} from "../src";

const baseConfig: HiloConfig = {
  maxSteps: 3,
  multipliers: [1.5, 2.5, 4],
};

const sampleDeck: Card[] = [
  { rank: 6, suit: "clubs" },
  { rank: 9, suit: "diamonds" },
  { rank: 3, suit: "spades" },
  { rank: 8, suit: "hearts" },
];

describe("game-math-hilo engine", () => {
  it("initializes state with the first card and base values", () => {
    const state = startRound(sampleDeck, 100, baseConfig);
    expect(state.currentCard).toEqual(sampleDeck[0]);
    expect(state.cursor).toBe(0);
    expect(state.step).toBe(0);
    expect(state.totalMultiplier).toBe(1);
    expect(state.finished).toBe(false);
  });

  it("progresses through deck and updates multipliers on wins", () => {
    let state = startRound(sampleDeck, 200, baseConfig);

    const first = applyGuess(state, "higher", baseConfig);
    expect(first.result).toBe("win");
    expect(first.step).toBe(1);
    expect(first.totalMultiplier).toBe(baseConfig.multipliers[0]);
    expect(first.state.finished).toBe(false);
    expect(first.nextCard).toEqual(sampleDeck[1]);

    const second = applyGuess(first.state, "lower", baseConfig);
    expect(second.result).toBe("win");
    expect(second.step).toBe(2);
    expect(second.totalMultiplier).toBe(baseConfig.multipliers[1]);
    expect(second.state.currentCard).toEqual(sampleDeck[2]);

    const cashoutAmount = getCashoutAmount(second.state);
    expect(cashoutAmount).toBe(200 * baseConfig.multipliers[1]);

    const third = applyGuess(second.state, "lower", baseConfig);
    expect(third.result).toBe("lose");
    expect(third.step).toBe(2);
    expect(third.totalMultiplier).toBe(baseConfig.multipliers[1]);
    expect(third.state.finished).toBe(true);
  });

  it("detects same-rank scenarios using suit tiebreakers", () => {
    const deck: Card[] = [
      { rank: 7, suit: "clubs" },
      { rank: 7, suit: "spades" },
      { rank: 4, suit: "diamonds" },
    ];
    const state = startRound(deck, 50, baseConfig);
    const outcome = applyGuess(state, "higher", baseConfig);
    expect(outcome.result).toBe("win");
    expect(outcome.sameRankDifferentSuit).toBe(true);
  });

  it("respects custom suit ordering", () => {
    const customConfig: HiloConfig = {
      ...baseConfig,
      suitOrder: ["spades", "hearts", "diamonds", "clubs"],
    };
    const deck: Card[] = [
      { rank: 10, suit: "spades" },
      { rank: 10, suit: "clubs" },
    ];
    const state = startRound(deck, 25, customConfig);
    const outcome = applyGuess(state, "higher", customConfig);
    expect(outcome.result).toBe("win");
    expect(outcome.sameRankDifferentSuit).toBe(true);
  });

  it("caps progress at maxSteps and disallows further guesses", () => {
    const cappedConfig: HiloConfig = { maxSteps: 2, multipliers: [2, 3] };
    const deck: Card[] = [
      { rank: 5, suit: "clubs" },
      { rank: 6, suit: "diamonds" },
      { rank: 8, suit: "hearts" },
    ];
    const state = startRound(deck, 75, cappedConfig);
    const first = applyGuess(state, "higher", cappedConfig);
    const second = applyGuess(first.state, "higher", cappedConfig);
    expect(second.state.finished).toBe(true);
    expect(() => applyGuess(second.state, "higher", cappedConfig)).toThrow(/finished/);
  });

  it("throws when the deck runs out of cards", () => {
    const shortDeck: Card[] = [
      { rank: 2, suit: "clubs" },
      { rank: 3, suit: "hearts" },
    ];
    const state = startRound(shortDeck, 10, baseConfig);
    const first = applyGuess(state, "higher", baseConfig);
    expect(() => applyGuess(first.state, "higher", baseConfig)).toThrow(/deck/);
  });

  it("marks cashout without mutating multiplier state", () => {
    const state = startRound(sampleDeck, 100, baseConfig);
    const win = applyGuess(state, "higher", baseConfig);
    const cashed = markCashout(win.state);
    expect(cashed.finished).toBe(true);
    expect(cashed.totalMultiplier).toBe(win.totalMultiplier);
  });

  it("compareCards reports suit-aware ordering", () => {
    const lower: Card = { rank: 9, suit: "diamonds" };
    const higher: Card = { rank: 11, suit: "clubs" };
    expect(compareCards(higher, lower).cmp).toBe(1);

    const suitWin = compareCards(
      { rank: 5, suit: "spades" },
      { rank: 5, suit: "clubs" },
      { suitOrder: ["clubs", "diamonds", "hearts", "spades"] },
    );
    expect(suitWin.cmp).toBe(1);
    expect(suitWin.sameRankDifferentSuit).toBe(true);
  });
});

