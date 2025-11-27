export type HiloChoice = "higher" | "lower";

export interface HiloConfig {
  deckSize: number;
  mathVersion: string;
}

export interface HiloState {
  currentCard: number;
  multiplier: number;
}

export class HiloEngine {
  constructor(private readonly config: HiloConfig) {}

  evaluate(state: HiloState, choice: HiloChoice, nextCard: number): { win: boolean; payoutMultiplier: number; state: HiloState } {
    const win = choice === "higher" ? nextCard > state.currentCard : nextCard < state.currentCard;
    const payoutMultiplier = win ? state.multiplier * 2 : 0;
    return {
      win,
      payoutMultiplier,
      state: {
        currentCard: nextCard,
        multiplier: win ? payoutMultiplier : 1,
      },
    };
  }
}
