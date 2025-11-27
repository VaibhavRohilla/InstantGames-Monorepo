import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

// NOTE: Stub math implementation for prototyping only; not production-ready.
export class PlinkoMathEngine {
  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const buckets = 5;
    const bucketIndex = Math.min(buckets - 1, Math.floor(input.rng() * buckets));
    const multiplier = [0, 0.5, 1, 2, 5][bucketIndex] ?? 0;
    const payout = BigInt(Math.floor(Number(input.betAmount) * multiplier));
    return {
      payout,
      metadata: {
        bucketIndex,
        multiplier,
      },
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    return input.betAmount * 5n;
  }
}
