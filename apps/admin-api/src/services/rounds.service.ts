import { Inject, Injectable } from "@nestjs/common";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { GameMode, GameName } from "@instant-games/core-types";

export interface ListRoundsParams {
  operatorId: string;
  game: GameName;
  mode: GameMode;
  userId?: string;
  cursor?: Date;
  limit: number;
}

export interface AdminRoundDto {
  id: string;
  game: GameName;
  mode: GameMode;
  operatorId: string;
  userId: string;
  currency: string;
  betAmount: string;
  payoutAmount: string;
  mathVersion: string;
  status: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  settledAt: string | null;
  meta: Record<string, unknown>;
  pfSeedId?: string;
}

@Injectable()
export class RoundsService {
  constructor(@Inject(DB_CLIENT) private readonly db: IDbClient) {}

  async list(params: ListRoundsParams): Promise<AdminRoundDto[]> {
    const values: any[] = [params.operatorId, params.game, params.mode];
    let sql = `SELECT * FROM game_rounds WHERE operator_id = $1 AND game = $2 AND mode = $3`;
    if (params.userId) {
      values.push(params.userId);
      sql += ` AND user_id = $${values.length}`;
    }
    if (params.cursor) {
      values.push(params.cursor.toISOString());
      sql += ` AND created_at < $${values.length}`;
    }
    values.push(params.limit);
    sql += ` ORDER BY created_at DESC LIMIT $${values.length}`;

    const rows = await this.db.query<RoundRow>(sql, values);
    return rows.map(mapRoundRow);
  }

  async findById(id: string): Promise<AdminRoundDto | null> {
    const rows = await this.db.query<RoundRow>(`SELECT * FROM game_rounds WHERE id = $1`, [id]);
    return rows.length ? mapRoundRow(rows[0]) : null;
  }
}

interface RoundRow {
  id: string;
  game: GameName;
  user_id: string;
  operator_id: string;
  mode: GameMode;
  currency: string;
  bet_amount: string;
  payout_amount: string;
  math_version: string;
  status: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  created_at: string;
  settled_at: string | null;
  meta: Record<string, unknown> | null;
}

function mapRoundRow(row: RoundRow): AdminRoundDto {
  const meta = row.meta ?? {};
  return {
    id: row.id,
    game: row.game,
    mode: row.mode,
    operatorId: row.operator_id,
    userId: row.user_id,
    currency: row.currency,
    betAmount: row.bet_amount.toString(),
    payoutAmount: row.payout_amount.toString(),
    mathVersion: row.math_version,
    status: row.status,
    serverSeedHash: row.server_seed_hash,
    clientSeed: row.client_seed,
    nonce: row.nonce,
    createdAt: new Date(row.created_at).toISOString(),
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    meta,
    pfSeedId: typeof meta["pfSeedId"] === "string" ? (meta["pfSeedId"] as string) : undefined,
  };
}

