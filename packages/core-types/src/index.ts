export type GameName =
  | "roulette"
  | "mines"
  | "dice"
  | "plinko"
  | "hilo"
  | "keno"
  | "wheel"
  | "coinflip";

export type GameMode = "demo" | "real";

export type GameRoundStatus = "PENDING" | "SETTLED" | "CANCELLED";

export interface CurrencyAmount {
  currency: string;
  amount: bigint;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProvablyFairInfo {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface RoundReference extends ProvablyFairInfo {
  roundId: string;
  game: GameName;
  mode: GameMode;
}

export interface BaseRoundResponse<TPayload = Record<string, unknown>> extends RoundReference {
  payload: TPayload;
  createdAt: string;
}

export interface BetResponse extends BaseRoundResponse {
  betAmount: bigint;
  payoutAmount: bigint;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export const ALL_GAMES: GameName[] = [
  "roulette",
  "mines",
  "dice",
  "plinko",
  "hilo",
  "keno",
  "wheel",
  "coinflip",
];
