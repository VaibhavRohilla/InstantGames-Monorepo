import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

// NOTE: Stub math implementation for prototyping only; not production-ready.
export class WheelMathEngine {
  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const segments = ["MISS", "MINI", "MEGA"];
    const segmentIndex = Math.min(segments.length - 1, Math.floor(input.rng() * segments.length));
    const segment = segments[segmentIndex];
    const multiplier = segment === "MEGA" ? 6 : segment === "MINI" ? 2 : 0;
    const payout = multiplier > 0 ? input.betAmount * BigInt(multiplier) : 0n;
    return {
      payout,
      metadata: {
        segment,
        multiplier,
      },
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    return input.betAmount * 6n;
  }
}
