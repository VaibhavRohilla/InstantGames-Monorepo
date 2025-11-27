import { Inject, Injectable } from "@nestjs/common";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { GameMode, GameName } from "@instant-games/core-types";

export interface LedgerQueryParams {
  operatorId: string;
  userId?: string;
  game?: GameName;
  roundId?: string;
  type?: string;
  startTime?: Date;
  endTime?: Date;
  limit: number;
}

export interface LedgerEntryDto {
  id: string;
  operatorId: string;
  userId: string;
  mode: GameMode;
  currency: string;
  amount: string;
  balanceBefore: string | null;
  balanceAfter: string | null;
  type: string;
  game: GameName;
  roundId: string;
  createdAt: string;
  meta: Record<string, unknown>;
}

@Injectable()
export class LedgerService {
  constructor(@Inject(DB_CLIENT) private readonly db: IDbClient) {}

  async list(params: LedgerQueryParams): Promise<LedgerEntryDto[]> {
    const values: any[] = [params.operatorId];
    let sql = `SELECT * FROM wallet_transactions WHERE operator_id = $1`;
    if (params.userId) {
      values.push(params.userId);
      sql += ` AND user_id = $${values.length}`;
    }
    if (params.game) {
      values.push(params.game);
      sql += ` AND game = $${values.length}`;
    }
    if (params.roundId) {
      values.push(params.roundId);
      sql += ` AND round_id = $${values.length}`;
    }
    if (params.type) {
      values.push(params.type);
      sql += ` AND type = $${values.length}`;
    }
    if (params.startTime) {
      values.push(params.startTime.toISOString());
      sql += ` AND created_at >= $${values.length}`;
    }
    if (params.endTime) {
      values.push(params.endTime.toISOString());
      sql += ` AND created_at <= $${values.length}`;
    }
    values.push(params.limit);
    sql += ` ORDER BY created_at DESC LIMIT $${values.length}`;

    const rows = await this.db.query<LedgerRow>(sql, values);
    return rows.map(mapLedgerRow);
  }
}

interface LedgerRow {
  id: string;
  operator_id: string;
  user_id: string;
  mode: GameMode;
  currency: string;
  amount: string;
  balance_before: string | null;
  balance_after: string | null;
  type: string;
  game: GameName;
  round_id: string;
  created_at: string;
  meta: Record<string, unknown> | null;
}

function mapLedgerRow(row: LedgerRow): LedgerEntryDto {
  return {
    id: row.id,
    operatorId: row.operator_id,
    userId: row.user_id,
    mode: row.mode,
    currency: row.currency,
    amount: row.amount.toString(),
    balanceBefore: row.balance_before ? row.balance_before.toString() : null,
    balanceAfter: row.balance_after ? row.balance_after.toString() : null,
    type: row.type,
    game: row.game,
    roundId: row.round_id,
    createdAt: new Date(row.created_at).toISOString(),
    meta: row.meta ?? {},
  };
}

