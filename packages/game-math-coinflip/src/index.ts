import { GameMathEvaluationInput, GameMathMaxPayoutInput, GameEvaluationResult } from "@instant-games/core-game-slice";

// NOTE: Stub math implementation for prototyping only; not production-ready.
export type CoinFlipChoice = "heads" | "tails";

export class CoinFlipMathEngine {
  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const choice = ((input.payload["choice"] as CoinFlipChoice) ?? "heads").toLowerCase() as CoinFlipChoice;
    const outcome: CoinFlipChoice = input.rng() < 0.5 ? "heads" : "tails";
    const win = outcome === choice;
    const payout = win ? input.betAmount * 2n : 0n;
    return {
      payout,
      metadata: {
        outcome,
        win,
        choice,
      },
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    return input.betAmount * 2n;
  }
}
