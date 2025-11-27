export interface PlinkoConfig {
  rows: number;
  payouts: number[]; // per bucket multiplier
  mathVersion: string;
}

export interface PlinkoResult {
  bucketIndex: number;
  multiplier: number;
  payout: bigint;
}

export class PlinkoEngine {
  constructor(private readonly config: PlinkoConfig) {}

  evaluate(betAmount: bigint, randomFloat: number): PlinkoResult {
    const bucketIndex = Math.min(this.config.payouts.length - 1, Math.floor(randomFloat * this.config.payouts.length));
    const multiplier = this.config.payouts[bucketIndex];
    const payout = BigInt(Math.floor(Number(betAmount) * multiplier));
    return { bucketIndex, multiplier, payout };
  }
}
