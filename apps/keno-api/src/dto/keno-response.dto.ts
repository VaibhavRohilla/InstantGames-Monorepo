export interface KenoBetResponse {
  roundId: string;
  betAmount: string;
  payout: string;
  currency: string;
  result: "WIN" | "LOSE";
  metadata: Record<string, unknown>;
  createdAt: string;
}

