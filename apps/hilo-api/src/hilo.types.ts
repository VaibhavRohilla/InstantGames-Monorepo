import { GameConfig } from "@instant-games/core-config";
import { Card, HiloConfig, HiloRoundState } from "@instant-games/game-math-hilo";

export type HiloRoundStatus = "active" | "lost" | "cashed_out" | "expired";

export interface HiloPersistedRoundRecord {
  roundId: string;
  operatorId: string;
  userId: string;
  currency: string;
  mode: "demo" | "real";
  config: HiloConfig;
  state: HiloRoundState;
  status: HiloRoundStatus;
  baseBet: bigint;
  serverSeedHash: string;
  serverSeedId: string;
  clientSeed: string;
  nonce: number;
  mathVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface HiloRuntimeConfig extends HiloConfig {
  mathVersion: string;
  minBet: bigint;
  maxBet: bigint;
  maxPayoutPerRound: bigint;
}

export interface HiloResolvedConfig {
  base: GameConfig;
  runtime: HiloRuntimeConfig;
}

export interface HiloRoundView {
  roundId: string;
  status: HiloRoundStatus;
  currentCard: Card;
  step: number;
  totalMultiplier: number;
  maxSteps: number;
  finished: boolean;
  baseBet: string;
  currency: string;
  mathVersion: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  updatedAt: string;
}

