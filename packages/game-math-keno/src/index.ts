import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

// NOTE: Stub math implementation for prototyping only; not production-ready.
export class KenoMathEngine {
  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const picks = Array.isArray(input.payload["picks"])
      ? (input.payload["picks"] as number[]).slice(0, 10)
      : [];
    const hitRoll = input.rng();
    const hits = hitRoll < 0.15 ? Math.max(1, Math.min(picks.length || 1, 3)) : 0;
    const payout = hits > 0 ? input.betAmount * BigInt(hits + 1) : 0n;
    return {
      payout,
      metadata: {
        picks,
        hits,
        drawnRoll: hitRoll,
      },
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    return input.betAmount * 4n;
  }
}
