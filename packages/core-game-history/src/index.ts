import { randomUUID } from "crypto";
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

export const GAME_ROUND_REPOSITORY = Symbol("GAME_ROUND_REPOSITORY");

export class GameRoundRepository implements IGameRoundRepository {
  constructor(private readonly db: IDbClient) {}

  async createPending(round: Omit<GameRoundRecord, "id" | "createdAt" | "settledAt" | "status" | "payoutAmount">): Promise<GameRoundRecord> {
    const id = randomUUID();
    const rows = await this.db.query<Row>(
      `INSERT INTO game_rounds (id, game, user_id, operator_id, mode, currency, bet_amount, payout_amount, math_version, status, server_seed_hash, server_seed, client_seed, nonce, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        id,
        round.game,
        round.userId,
        round.operatorId,
        round.mode,
        round.currency,
        round.betAmount.toString(),
        "0",
        round.mathVersion,
        "PENDING",
        round.serverSeedHash,
        round.serverSeed,
        round.clientSeed,
        round.nonce,
        JSON.stringify(round.meta ?? {}),
      ]
    );
    return mapRow(rows[0]);
  }

  async markSettled(id: string, payoutAmount: bigint, metaUpdate: Record<string, unknown> = {}): Promise<GameRoundRecord> {
    const rows = await this.db.query<Row>(
      `UPDATE game_rounds SET status = 'SETTLED', payout_amount = $2, settled_at = NOW(), meta = COALESCE(meta, '{}'::jsonb) || $3::jsonb WHERE id = $1 RETURNING *`,
      [id, payoutAmount.toString(), JSON.stringify(metaUpdate)]
    );
    if (!rows.length) throw new Error("Round not found");
    return mapRow(rows[0]);
  }

  async markCancelled(id: string, reason: string): Promise<GameRoundRecord> {
    const rows = await this.db.query<Row>(
      `UPDATE game_rounds SET status = 'CANCELLED', meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb WHERE id = $1 RETURNING *`,
      [id, JSON.stringify({ cancelReason: reason })]
    );
    if (!rows.length) throw new Error("Round not found");
    return mapRow(rows[0]);
  }

  async findById(id: string): Promise<GameRoundRecord | null> {
    const rows = await this.db.query<Row>(`SELECT * FROM game_rounds WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async listForUser(userId: string, game?: GameName, limit = 50, offset = 0): Promise<GameRoundRecord[]> {
    const params: any[] = [userId];
    let sql = `SELECT * FROM game_rounds WHERE user_id = $1`;
    if (game) {
      params.push(game);
      sql += ` AND game = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const rows = await this.db.query<Row>(sql, params);
    return rows.map(mapRow);
  }
}

interface Row {
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
  server_seed: string | null;
  client_seed: string;
  nonce: number;
  created_at: string;
  settled_at: string | null;
  meta: Record<string, unknown> | null;
}

function mapRow(row: Row): GameRoundRecord {
  return {
    id: row.id,
    game: row.game,
    userId: row.user_id,
    operatorId: row.operator_id,
    mode: row.mode,
    currency: row.currency,
    betAmount: BigInt(row.bet_amount),
    payoutAmount: BigInt(row.payout_amount),
    mathVersion: row.math_version,
    status: row.status as GameRoundStatus,
    serverSeedHash: row.server_seed_hash,
    serverSeed: row.server_seed,
    clientSeed: row.client_seed,
    nonce: row.nonce,
    createdAt: new Date(row.created_at),
    settledAt: row.settled_at ? new Date(row.settled_at) : null,
    meta: row.meta ?? {},
  };
}
