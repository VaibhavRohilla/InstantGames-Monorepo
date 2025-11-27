import { randomUUID } from "crypto";
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

export const WALLET_TRANSACTION_REPOSITORY = Symbol("WALLET_TRANSACTION_REPOSITORY");

export class WalletTransactionRepository implements IWalletTransactionRepository {
  constructor(private readonly db: IDbClient) {}

  async log(tx: WalletTransaction): Promise<void> {
    await this.db.query(
      `INSERT INTO wallet_transactions (id, user_id, operator_id, mode, currency, amount, balance_before, balance_after, type, game, round_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)` ,
      [
        tx.id || randomUUID(),
        tx.userId,
        tx.operatorId,
        tx.mode,
        tx.currency,
        tx.amount.toString(),
        tx.balanceBefore ? tx.balanceBefore.toString() : null,
        tx.balanceAfter ? tx.balanceAfter.toString() : null,
        tx.type,
        tx.game,
        tx.roundId,
        JSON.stringify(tx.meta ?? {}),
      ]
    );
  }

  async listForUser(userId: string, limit = 100, offset = 0): Promise<WalletTransaction[]> {
    const rows = await this.db.query<Row>(
      `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows.map(mapRow);
  }
}

interface Row {
  id: string;
  user_id: string;
  operator_id: string;
  mode: GameMode;
  currency: string;
  amount: string;
  balance_before: string | null;
  balance_after: string | null;
  type: WalletTransaction["type"];
  game: GameName;
  round_id: string;
  created_at: string;
  meta: Record<string, unknown> | null;
}

function mapRow(row: Row): WalletTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    operatorId: row.operator_id,
    mode: row.mode,
    currency: row.currency,
    amount: BigInt(row.amount),
    balanceBefore: row.balance_before ? BigInt(row.balance_before) : null,
    balanceAfter: row.balance_after ? BigInt(row.balance_after) : null,
    type: row.type,
    game: row.game,
    roundId: row.round_id,
    createdAt: new Date(row.created_at),
    meta: row.meta ?? {},
  };
}
