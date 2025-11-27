import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

// NOTE: Stub math implementation for prototyping only; not production-ready.
export interface RouletteBetPayload {
  selection?: number;
}

export class RouletteMathEngine {
  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const rolled = Math.floor(input.rng() * 10); // 0..9
    const selection = typeof input.payload["selection"] === "number" ? Number(input.payload["selection"]) : 0;
    const win = rolled === selection;
    const payout = win ? input.betAmount * 10n : 0n;
    return {
      payout,
      metadata: {
        rolled,
        selection,
        win,
      },
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    return input.betAmount * 10n;
  }
}
