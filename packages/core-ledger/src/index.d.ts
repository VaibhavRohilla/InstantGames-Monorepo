import { GameMode, GameName } from "@instant-games/core-types";
import { IDbClient } from "@instant-games/core-db";
export interface WalletTransaction {
    id: string;
    userId: string;
    operatorId: string;
    mode: GameMode;
    currency: string;
    amount: bigint;
    balanceBefore?: bigint | null;
    balanceAfter?: bigint | null;
    type: "BET" | "PAYOUT" | "REFUND" | "BONUS" | "FEE";
    game: GameName;
    roundId: string;
    createdAt: Date;
    meta: Record<string, unknown>;
}
export interface IWalletTransactionRepository {
    log(tx: WalletTransaction): Promise<void>;
    listForUser(userId: string, limit?: number, offset?: number): Promise<WalletTransaction[]>;
}
export declare const WALLET_TRANSACTION_REPOSITORY: unique symbol;
export declare class WalletTransactionRepository implements IWalletTransactionRepository {
    private readonly db;
    constructor(db: IDbClient);
    log(tx: WalletTransaction): Promise<void>;
    listForUser(userId: string, limit?: number, offset?: number): Promise<WalletTransaction[]>;
}
