import { randomUUID } from "crypto";
import { newDb, DataType } from "pg-mem";
import { IDbClient } from "@instant-games/core-db";
import { IKeyValueStore, ILockManager, deserializeFromRedis, serializeForRedis } from "@instant-games/core-redis";
import { ILogger } from "@instant-games/core-logging";
import { IMetrics } from "@instant-games/core-metrics";
import { GameMode } from "@instant-games/core-types";

export class InMemoryStore implements IKeyValueStore {
  private store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    return deserializeFromRedis<T>(this.store.get(key) ?? null);
  }

  async set<T>(key: string, value: T, _ttlSeconds?: number): Promise<void> {
    this.store.set(key, serializeForRedis(value));
  }

  async setNx(key: string, value: string, _ttlSeconds?: number): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, serializeForRedis(value));
    return true;
  }

  async incr(key: string, _ttlSeconds?: number): Promise<number> {
    const next = Number(this.store.get(key) ?? "0") + 1;
    this.store.set(key, next.toString());
    return next;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class NoopLockManager implements ILockManager {
  async withLock<T>(_key: string, _ttlMs: number, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export class InMemoryLogger implements ILogger {
  info(): void {}
  warn(): void {}
  error(): void {}
}

export class NoopMetrics implements IMetrics {
  increment(): void {}
  observe(): void {}
}

export async function createDbClient(): Promise<IDbClient> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: "now",
    returns: DataType.timestamptz,
    implementation: () => new Date(),
  });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => randomUUID(),
  });

  const schemaStatements = [
    `CREATE TABLE operators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      metadata TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE game_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id TEXT NOT NULL REFERENCES operators(id),
      game TEXT NOT NULL,
      currency TEXT NOT NULL,
      mode TEXT NOT NULL,
      min_bet NUMERIC(36, 0) NOT NULL,
      max_bet NUMERIC(36, 0) NOT NULL,
      max_payout_per_round NUMERIC(36, 0) NOT NULL,
      volatility_profile TEXT,
      math_version TEXT NOT NULL,
      demo_enabled BOOLEAN DEFAULT TRUE,
      real_enabled BOOLEAN DEFAULT TRUE,
      features TEXT,
      extra TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (operator_id, game, currency, mode)
    )`,
    `CREATE TABLE game_rounds (
      id UUID PRIMARY KEY,
      game TEXT NOT NULL,
      user_id TEXT NOT NULL,
      operator_id TEXT NOT NULL REFERENCES operators(id),
      mode TEXT NOT NULL,
      currency TEXT NOT NULL,
      bet_amount NUMERIC(36, 0) NOT NULL,
      payout_amount NUMERIC(36, 0) NOT NULL DEFAULT 0,
      math_version TEXT NOT NULL,
      status TEXT NOT NULL,
      server_seed_hash TEXT NOT NULL,
      server_seed TEXT,
      client_seed TEXT NOT NULL,
      nonce INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      settled_at TIMESTAMPTZ,
      meta TEXT
    )`,
    `CREATE TABLE wallet_transactions (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      operator_id TEXT NOT NULL REFERENCES operators(id),
      mode TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount NUMERIC(36, 0) NOT NULL,
      balance_before NUMERIC(36, 0),
      balance_after NUMERIC(36, 0),
      type TEXT NOT NULL,
      game TEXT NOT NULL,
      round_id UUID NOT NULL REFERENCES game_rounds(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      meta TEXT
    )`,
    `CREATE TABLE pf_server_seeds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id TEXT NOT NULL REFERENCES operators(id),
      game TEXT NOT NULL,
      mode TEXT NOT NULL,
      server_seed TEXT NOT NULL,
      server_seed_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rotated_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE
    )`,
    `CREATE TABLE wallet_balances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id TEXT NOT NULL REFERENCES operators(id),
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      mode TEXT NOT NULL,
      balance NUMERIC(36, 0) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (operator_id, user_id, currency, mode)
    )`,
  ];

  for (const statement of schemaStatements) {
    db.public.none(statement);
  }

  const pg = db.adapters.createPg();
  const pool = new pg.Pool();

  return {
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },
    async transaction<T>(fn: (tx: IDbClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txClient: IDbClient = {
          query: async (sql: string, params: any[] = []) => {
            const res = await client.query(sql, params);
            return res.rows as any[];
          },
          transaction: () => Promise.reject(new Error("Nested transactions are not supported")),
        };
        const result = await fn(txClient);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export async function seedOperator(db: IDbClient, operatorId: string, name = "Test Operator"): Promise<void> {
  await db.query(
    `INSERT INTO operators (id, name) VALUES ($1,$2)
     ON CONFLICT (id) DO NOTHING`,
    [operatorId, name],
  );
}

export interface SeedConfigParams {
  operatorId: string;
  game: string;
  currency: string;
  mode: GameMode;
  minBet?: string;
  maxBet?: string;
  maxPayout?: string;
  mathVersion?: string;
  extra?: Record<string, unknown>;
  enabled?: boolean;
}

export async function seedGameConfig(params: SeedConfigParams & { db: IDbClient }): Promise<void> {
  const {
    db,
    operatorId,
    game,
    currency,
    mode,
    minBet = "100",
    maxBet = "100000",
    maxPayout = "1000000",
    mathVersion = "v1",
    extra = {},
    enabled = true,
  } = params;
  await db.query(
    `INSERT INTO game_configs (id, operator_id, game, currency, mode, min_bet, max_bet, max_payout_per_round, math_version, demo_enabled, real_enabled, extra)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (operator_id, game, currency, mode)
     DO UPDATE SET min_bet = EXCLUDED.min_bet,
                   max_bet = EXCLUDED.max_bet,
                   max_payout_per_round = EXCLUDED.max_payout_per_round,
                   math_version = EXCLUDED.math_version,
                   extra = EXCLUDED.extra,
                   demo_enabled = EXCLUDED.demo_enabled,
                   real_enabled = EXCLUDED.real_enabled`,
    [
      operatorId,
      game,
      currency,
      mode,
      minBet,
      maxBet,
      maxPayout,
      mathVersion,
      mode === "demo" ? enabled : true,
      mode === "real" ? enabled : true,
      JSON.stringify(extra),
    ],
  );
}

