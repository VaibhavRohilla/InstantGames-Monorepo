import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

export type DiceCondition = "over" | "under";

export interface DiceMathConfig {
  mathVersion: string;
  houseEdge: number;
  minTarget: number;
  maxTarget: number;
  maxMultiplier?: number;
}

export interface DiceBetInput {
  target: number;
  condition: DiceCondition;
}

export interface DiceEvaluationMetadata extends Record<string, unknown> {
  rolled: number;
  win: boolean;
  multiplier: number;
  target: number;
  condition: DiceCondition;
}

const MULTIPLIER_SCALE = 10_000n;

export class DiceMathEngine {
  constructor(private readonly config: DiceMathConfig) {}

  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const bet = this.toBetInput(input.payload ?? {});
    this.validateBet(bet);

    const multiplier = this.computeMultiplier(bet);
    const rolled = this.roll(input.rng());
    const win = this.didPlayerWin(bet, rolled);
    const payout = win ? this.applyMultiplier(input.betAmount, multiplier) : BigInt(0);

    return {
      payout,
      metadata: {
        rolled,
        win,
        multiplier,
        target: bet.target,
        condition: bet.condition,
      } satisfies DiceEvaluationMetadata,
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    const bet = this.toBetInput(input.payload ?? {});
    const multiplier = this.computeMultiplier(bet);
    return this.applyMultiplier(input.betAmount, multiplier);
  }

  private toBetInput(payload: Record<string, unknown>): DiceBetInput {
    return {
      target: Number(payload["target"]),
      condition: (payload["condition"] as DiceCondition) ?? "under",
    };
  }

  private validateBet(bet: DiceBetInput) {
    if (bet.target < this.config.minTarget || bet.target > this.config.maxTarget) {
      throw new Error("INVALID_TARGET");
    }
  }

  private didPlayerWin(bet: DiceBetInput, rolled: number): boolean {
    return bet.condition === "over" ? rolled > bet.target : rolled < bet.target;
  }

  private computeMultiplier(bet: DiceBetInput): number {
    const probability = bet.condition === "over" ? (100 - bet.target) / 100 : bet.target / 100;
    if (probability <= 0) {
      throw new Error("INVALID_PROBABILITY");
    }
    const edgeFactor = 1 - this.config.houseEdge / 100;
    let multiplier = edgeFactor / probability;
    if (this.config.maxMultiplier) {
      multiplier = Math.min(multiplier, this.config.maxMultiplier);
    }
    return Number(multiplier.toFixed(4));
  }

  private applyMultiplier(amount: bigint, multiplier: number): bigint {
    const scaledMultiplier = BigInt(Math.round(multiplier * Number(MULTIPLIER_SCALE)));
    return (amount * scaledMultiplier) / MULTIPLIER_SCALE;
  }

  private roll(rand: number): number {
    return Math.min(100, Math.max(1, Math.floor(rand * 100) + 1));
  }
}
