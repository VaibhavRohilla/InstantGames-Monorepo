import { HiloChoice } from "@instant-games/game-math-hilo";

export interface HiloBetResponse {
  roundId: string;
  betAmount: string;
  payoutAmount: string;
  currency: string;
  currentRank: number;
  drawnRank: number;
  choice: HiloChoice;
  isWin: boolean;
  winAmount: number;
  payoutMultiplier: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  mathVersion: string;
  createdAt: string;
}

