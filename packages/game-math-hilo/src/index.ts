import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

// NOTE: Stub math implementation for prototyping only; not production-ready.
export type HiloChoice = "higher" | "lower";

export class HiloMathEngine {
  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const currentCard = typeof input.payload["currentCard"] === "number" ? Number(input.payload["currentCard"]) : 7;
    const choice = ((input.payload["choice"] as HiloChoice) ?? "higher").toLowerCase() as HiloChoice;
    const nextCard = Math.max(1, Math.min(13, Math.floor(input.rng() * 13) + 1));
    const win = choice === "higher" ? nextCard > currentCard : nextCard < currentCard;
    const payout = win ? input.betAmount * 2n : 0n;
    return {
      payout,
      metadata: {
        currentCard,
        nextCard,
        choice,
        win,
      },
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    return input.betAmount * 2n;
  }
}
