import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

// NOTE: Stub math implementation for prototyping only; not production-ready.
export class MinesMathEngine {
  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const revealIndex = typeof input.payload["cell"] === "number" ? Number(input.payload["cell"]) : 0;
    const win = input.rng() < 0.25;
    const payout = win ? input.betAmount * 3n : 0n;
    return {
      payout,
      metadata: {
        revealIndex,
        win,
      },
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    return input.betAmount * 3n;
  }
}
