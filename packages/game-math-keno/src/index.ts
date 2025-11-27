// NOTE: Stub math implementation for prototyping only; not production-ready.
export interface KenoConfig {
  mathVersion: string;
  maxPicks: number;
  boardSize: number;
  payoutTable: Record<number, number>; // hits -> multiplier
}

export interface KenoBet {
  picks: number[];
}

export interface KenoResult {
  drawn: number[];
  hits: number;
  multiplier: number;
  payout: bigint;
}

export class KenoEngine {
  constructor(private readonly config: KenoConfig) {}

  evaluate(betAmount: bigint, bet: KenoBet, drawnNumbers: number[]): KenoResult {
    if (bet.picks.length === 0 || bet.picks.length > this.config.maxPicks) {
      throw new Error("INVALID_PICKS");
    }
    const hits = bet.picks.filter((pick) => drawnNumbers.includes(pick)).length;
    const multiplier = this.config.payoutTable[hits] ?? 0;
    const payout = BigInt(Math.floor(Number(betAmount) * multiplier));
    return { drawn: drawnNumbers, hits, multiplier, payout };
  }
}
