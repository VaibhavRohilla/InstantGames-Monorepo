import { Inject, Injectable } from "@nestjs/common";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { GameMode } from "@instant-games/core-types";

export interface WalletSearchParams {
  operatorId: string;
  userId?: string;
  currency?: string;
  mode?: GameMode;
}

export interface WalletBalanceDto {
  operatorId: string;
  userId: string;
  currency: string;
  mode: GameMode;
  balance: string;
  updatedAt: string | null;
  createdAt: string | null;
}

@Injectable()
export class WalletsService {
  constructor(@Inject(DB_CLIENT) private readonly db: IDbClient) {}

  async search(params: WalletSearchParams): Promise<WalletBalanceDto[]> {
    const values: any[] = [params.operatorId];
    let sql = `SELECT * FROM wallet_balances WHERE operator_id = $1`;
    if (params.userId) {
      values.push(params.userId);
      sql += ` AND user_id = $${values.length}`;
    }
    if (params.currency) {
      values.push(params.currency);
      sql += ` AND currency = $${values.length}`;
    }
    if (params.mode) {
      values.push(params.mode);
      sql += ` AND mode = $${values.length}`;
    }
    sql += ` ORDER BY updated_at DESC LIMIT 200`;

    const rows = await this.db.query<WalletRow>(sql, values);
    return rows.map(mapWalletRow);
  }

  async getBalance(operatorId: string, userId: string, currency: string, mode: GameMode): Promise<WalletBalanceDto> {
    const rows = await this.db.query<WalletRow>(
      `SELECT * FROM wallet_balances WHERE operator_id = $1 AND user_id = $2 AND currency = $3 AND mode = $4`,
      [operatorId, userId, currency, mode]
    );
    if (!rows.length) {
      return {
        operatorId,
        userId,
        currency,
        mode,
        balance: "0",
        createdAt: null,
        updatedAt: null,
      };
    }
    return mapWalletRow(rows[0]);
  }
}

interface WalletRow {
  operator_id: string;
  user_id: string;
  currency: string;
  mode: GameMode;
  balance: string;
  created_at: string;
  updated_at: string;
}

function mapWalletRow(row: WalletRow): WalletBalanceDto {
  return {
    operatorId: row.operator_id,
    userId: row.user_id,
    currency: row.currency,
    mode: row.mode,
    balance: row.balance.toString(),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

