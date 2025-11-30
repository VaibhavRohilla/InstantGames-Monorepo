import { CoinFlipSide } from "@instant-games/game-math-coinflip";

export interface CoinflipBetResponse {
  roundId: string;
  betAmount: string;
  payoutAmount: string;
  currency: string;
  pickedSide: CoinFlipSide;
  outcome: CoinFlipSide;
  isWin: boolean;
  winAmount: number;
  payoutMultiplier: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  mathVersion: string;
  createdAt: string;
}
