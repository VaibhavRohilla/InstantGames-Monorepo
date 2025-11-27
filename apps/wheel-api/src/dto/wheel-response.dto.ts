export interface WheelBetResponse {
  roundId: string;
  betAmount: string;
  payout: string;
  currency: string;
  result: "WIN" | "LOSE";
  metadata: Record<string, unknown>;
  createdAt: string;
}

