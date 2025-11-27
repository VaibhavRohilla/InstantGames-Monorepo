export type DiceCondition = "over" | "under";

export interface DiceMathConfig {
  mathVersion: string;
  houseEdge: number; // percentage
  minTarget: number;
  maxTarget: number;
  maxMultiplier?: number;
}

export interface DiceBetInput {
  target: number; // integer 1-99
  condition: DiceCondition;
}

export interface DiceEvaluationResult {
  rolled: number;
  win: boolean;
  multiplier: number;
  payout: bigint;
}

export class DiceMathEngine {
  constructor(private readonly config: DiceMathConfig) {}

  evaluate(betAmount: bigint, bet: DiceBetInput, rolled: number): DiceEvaluationResult {
    this.validateBet(bet);
    const multiplier = this.computeMultiplier(bet);
    const win = this.didPlayerWin(bet, rolled);
    const payout = win ? BigInt(Math.floor(Number(betAmount) * multiplier)) : BigInt(0);

    return {
      rolled,
      win,
      multiplier,
      payout,
    };
  }

  estimateMaxPayout(betAmount: bigint, bet: DiceBetInput): bigint {
    const multiplier = this.computeMultiplier(bet);
    return BigInt(Math.floor(Number(betAmount) * multiplier));
  }

  private validateBet(bet: DiceBetInput) {
    if (bet.target < this.config.minTarget || bet.target > this.config.maxTarget) {
      throw new Error("INVALID_TARGET");
    }
  }

  private didPlayerWin(bet: DiceBetInput, rolled: number): boolean {
    if (bet.condition === "over") {
      return rolled > bet.target;
    }
    return rolled < bet.target;
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
}
