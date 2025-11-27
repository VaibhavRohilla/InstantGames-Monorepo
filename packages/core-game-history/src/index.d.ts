import { IDbClient } from "@instant-games/core-db";
import { GameMode, GameName, GameRoundStatus } from "@instant-games/core-types";
export interface GameRoundRecord {
    id: string;
    game: GameName;
    userId: string;
    operatorId: string;
    mode: GameMode;
    currency: string;
    betAmount: bigint;
    payoutAmount: bigint;
    mathVersion: string;
    status: GameRoundStatus;
    serverSeedHash: string;
    serverSeed: string | null;
    clientSeed: string;
    nonce: number;
    createdAt: Date;
    settledAt: Date | null;
    meta: Record<string, unknown>;
}
export interface IGameRoundRepository {
    createPending(round: Omit<GameRoundRecord, "id" | "createdAt" | "settledAt" | "status" | "payoutAmount">): Promise<GameRoundRecord>;
    markSettled(id: string, payoutAmount: bigint, metaUpdate?: Record<string, unknown>): Promise<GameRoundRecord>;
    markCancelled(id: string, reason: string): Promise<GameRoundRecord>;
    findById(id: string): Promise<GameRoundRecord | null>;
    listForUser(userId: string, game?: GameName, limit?: number, offset?: number): Promise<GameRoundRecord[]>;
}
export declare const GAME_ROUND_REPOSITORY: unique symbol;
export declare class GameRoundRepository implements IGameRoundRepository {
    private readonly db;
    constructor(db: IDbClient);
    createPending(round: Omit<GameRoundRecord, "id" | "createdAt" | "settledAt" | "status" | "payoutAmount">): Promise<GameRoundRecord>;
    markSettled(id: string, payoutAmount: bigint, metaUpdate?: Record<string, unknown>): Promise<GameRoundRecord>;
    markCancelled(id: string, reason: string): Promise<GameRoundRecord>;
    findById(id: string): Promise<GameRoundRecord | null>;
    listForUser(userId: string, game?: GameName, limit?: number, offset?: number): Promise<GameRoundRecord[]>;
}
