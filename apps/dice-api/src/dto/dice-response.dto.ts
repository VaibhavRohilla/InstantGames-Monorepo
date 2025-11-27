export interface DiceBetResponse {
  roundId: string;
  betAmount: string;
  payoutAmount: string;
  rolled: number;
  target: number;
  condition: "over" | "under";
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  mathVersion: string;
  createdAt: string;
}
