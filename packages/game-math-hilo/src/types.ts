export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export const DEFAULT_SUIT_ORDER: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

export interface Card {
  rank: number; // 2–14 (J=11, Q=12, K=13, A=14)
  suit: Suit;
}

export type GuessDirection = "higher" | "lower";

export interface HiloConfig {
  maxSteps: number;
  multipliers: number[]; // multipliers[0] = after first correct guess
  suitOrder?: Suit[];
}

export interface HiloRoundState {
  deck: Card[];
  cursor: number;
  currentCard: Card;
  step: number;
  baseBet: number;
  totalMultiplier: number;
  finished: boolean;
}

export interface CompareResult {
  cmp: -1 | 0 | 1;
  sameRankDifferentSuit: boolean;
}

export interface HiloCompareConfig {
  suitOrder?: Suit[];
}

export interface GuessOutcome {
  state: HiloRoundState;
  nextCard: Card;
  result: "win" | "lose";
  totalMultiplier: number;
  step: number;
  sameRankDifferentSuit: boolean;
}


