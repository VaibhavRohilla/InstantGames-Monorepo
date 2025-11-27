export type CoinFlipChoice = "heads" | "tails";

export interface CoinFlipResult {
  outcome: CoinFlipChoice;
  win: boolean;
  payout: bigint;
}

export class CoinFlipEngine {
  evaluate(betAmount: bigint, choice: CoinFlipChoice, randomFloat: number): CoinFlipResult {
    const outcome: CoinFlipChoice = randomFloat < 0.5 ? "heads" : "tails";
    const win = outcome === choice;
    const payout = win ? betAmount * BigInt(2) : BigInt(0);
    return { outcome, win, payout };
  }
}
