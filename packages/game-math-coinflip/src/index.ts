import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

export type CoinFlipSide = "HEADS" | "TAILS";

export interface CoinFlipMathConfig {
  mathVersion: string;
  houseEdge: number;
  maxMultiplier?: number;
}

export interface CoinFlipBetInput {
  side: CoinFlipSide;
}

export interface CoinFlipEvaluationMetadata extends Record<string, unknown> {
  outcome: CoinFlipSide;
  win: boolean;
  multiplier: number;
  side: CoinFlipSide;
}

const MULTIPLIER_SCALE = 10_000n;
const FAIR_PROBABILITY = 0.5;

export class CoinFlipMathEngine {
  constructor(private readonly config: CoinFlipMathConfig) {}

  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const bet = this.toBetInput(input.payload ?? {});
    const multiplier = this.computeMultiplier();
    const outcome = this.pickOutcome(input.rng());
    const win = this.didPlayerWin(bet, outcome);
    const payout = win ? this.applyMultiplier(input.betAmount, multiplier) : BigInt(0);

    return {
      payout,
      metadata: {
        outcome,
        win,
        multiplier,
        side: bet.side,
      } satisfies CoinFlipEvaluationMetadata,
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    const multiplier = this.computeMultiplier();
    return this.applyMultiplier(input.betAmount, multiplier);
  }

  private toBetInput(payload: Record<string, unknown>): CoinFlipBetInput {
    const raw = payload["side"];
    if (typeof raw !== "string") {
      throw new Error("CoinFlip: side is required");
    }
    const normalized = raw.trim().toUpperCase();
    if (normalized !== "HEADS" && normalized !== "TAILS") {
      throw new Error("CoinFlip: side must be HEADS or TAILS");
    }
    return { side: normalized as CoinFlipSide };
  }

  private computeMultiplier(): number {
    const edgeFactor = 1 - this.config.houseEdge / 100;
    if (!Number.isFinite(edgeFactor) || edgeFactor <= 0) {
      throw new Error("CoinFlip: invalid houseEdge");
    }

    let multiplier = (1 / FAIR_PROBABILITY) * edgeFactor;
    if (this.config.maxMultiplier != null) {
      multiplier = Math.min(multiplier, this.config.maxMultiplier);
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error("CoinFlip: invalid multiplier");
    }

    return Number(multiplier.toFixed(4));
  }

  private pickOutcome(rand: number): CoinFlipSide {
    if (!Number.isFinite(rand) || rand < 0 || rand >= 1) {
      throw new Error("CoinFlip: rng() must return value in [0, 1)");
    }
    return rand < 0.5 ? "HEADS" : "TAILS";
  }

  private didPlayerWin(bet: CoinFlipBetInput, outcome: CoinFlipSide): boolean {
    return bet.side === outcome;
  }

  private applyMultiplier(amount: bigint, multiplier: number): bigint {
    const scaled = BigInt(Math.round(multiplier * Number(MULTIPLIER_SCALE)));
    return (amount * scaled) / MULTIPLIER_SCALE;
  }
}
