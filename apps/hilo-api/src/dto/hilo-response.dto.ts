export interface HiloBetResponse {
  roundId: string;
  betAmount: string;
  payout: string;
  currency: string;
  result: "WIN" | "LOSE";
  metadata: Record<string, unknown>;
  createdAt: string;
}

