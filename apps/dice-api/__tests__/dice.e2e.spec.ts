import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { newDb, DataType } from "pg-mem";
import { randomUUID } from "crypto";
import { DiceController } from "../src/dice.controller";
import { DiceService } from "../src/dice.service";
import { AuthModule } from "@instant-games/core-auth";
import { ProvablyFairService, PROVABLY_FAIR_SERVICE, PROVABLY_FAIR_STATE_STORE, RedisProvablyFairStateStore } from "@instant-games/core-provably-fair";
import { ProvablyFairRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { GAME_CONFIG_SERVICE, DbGameConfigService } from "@instant-games/core-config";
import { GameRoundRepository, GAME_ROUND_REPOSITORY } from "@instant-games/core-game-history";
import { WalletTransactionRepository, WALLET_TRANSACTION_REPOSITORY } from "@instant-games/core-ledger";
import { DemoWalletService, WalletRouter, WALLET_ROUTER } from "@instant-games/core-wallet";
import { IDEMPOTENCY_STORE, RedisIdempotencyStore } from "@instant-games/core-idempotency";
import { LOGGER, ILogger } from "@instant-games/core-logging";
import { IMetrics, METRICS } from "@instant-games/core-metrics";
import { NoopBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { RiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { IDbClient } from "@instant-games/core-db";
import { IKeyValueStore, ILockManager } from "@instant-games/core-redis";

const BIGINT_PREFIX = "__bigint__:";

class InMemoryStore implements IKeyValueStore {
  private store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    return value ? (JSON.parse(value, this.reviver) as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value, this.replacer));
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  private replacer(_key: string, value: unknown) {
    if (typeof value === "bigint") {
      return `${BIGINT_PREFIX}${value.toString()}`;
    }
    return value;
  }

  private reviver(_key: string, value: unknown) {
    if (typeof value === "string" && value.startsWith(BIGINT_PREFIX)) {
      return BigInt(value.slice(BIGINT_PREFIX.length));
    }
    return value;
  }
}

class NoopLockManager implements ILockManager {
  async withLock<T>(_key: string, _ttlMs: number, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

class InMemoryLogger implements ILogger {
  info(): void {}
  warn(): void {}
  error(): void {}
}

class NoopMetrics implements IMetrics {
  increment(): void {}
  observe(): void {}
}

async function createDbClient(): Promise<IDbClient> {
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
  ];

  for (const statement of schemaStatements) {
    db.public.none(statement);
  }
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();

  return {
    async query(sql: string, params: any[] = []) {
      const result = await pool.query(sql, params);
      return result.rows as any[];
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
          transaction: () => Promise.reject(new Error("Nested transactions not supported")),
        };
        const result = await fn(txClient);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

describe("Dice API e2e", () => {
  let app: INestApplication;
  let dbClient: IDbClient;
  let kvStore: InMemoryStore;

  beforeAll(async () => {
    dbClient = await createDbClient();
    kvStore = new InMemoryStore();

    await dbClient.query(`INSERT INTO operators (id, name) VALUES ($1, $2)`, ["op-test", "Test Operator"]);
    await dbClient.query(
      `INSERT INTO game_configs (operator_id, game, currency, mode, min_bet, max_bet, max_payout_per_round, math_version, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      ["op-test", "dice", "USD", "demo", "100", "100000", "1000000", "v1", JSON.stringify({})]
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [DiceController],
      providers: [
        DiceService,
        { provide: PROVABLY_FAIR_SERVICE, useClass: ProvablyFairService },
        {
          provide: PROVABLY_FAIR_STATE_STORE,
          useFactory: (pfService: ProvablyFairService) => new RedisProvablyFairStateStore(kvStore, pfService),
          inject: [PROVABLY_FAIR_SERVICE],
        },
        {
          provide: RNG_SERVICE,
          useFactory: (pfService: ProvablyFairService) => new ProvablyFairRngService(pfService),
          inject: [PROVABLY_FAIR_SERVICE],
        },
        {
          provide: GAME_CONFIG_SERVICE,
          useFactory: () => new DbGameConfigService(dbClient, kvStore),
        },
        {
          provide: GAME_ROUND_REPOSITORY,
          useFactory: () => new GameRoundRepository(dbClient),
        },
        {
          provide: WALLET_TRANSACTION_REPOSITORY,
          useFactory: () => new WalletTransactionRepository(dbClient),
        },
        {
          provide: WALLET_ROUTER,
          useFactory: () => new WalletRouter(new DemoWalletService(kvStore, new NoopLockManager())),
        },
        { provide: IDEMPOTENCY_STORE, useFactory: () => new RedisIdempotencyStore(kvStore) },
        { provide: LOGGER, useClass: InMemoryLogger },
        { provide: METRICS, useClass: NoopMetrics },
        {
          provide: RISK_SERVICE,
          useFactory: (cfg: DbGameConfigService) => new RiskService(cfg, kvStore),
          inject: [GAME_CONFIG_SERVICE],
        },
        { provide: BONUS_PORT, useClass: NoopBonusPort },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const walletRouter = app.get<WalletRouter>(WALLET_ROUTER);
    await walletRouter.resolve("demo").credit("player-1", BigInt(1000), "USD", "demo");
  });

afterAll(async () => {
  if (app) {
    await app.close();
  }
});

  it("places and settles a dice bet", async () => {
    const response = await request(app.getHttpServer())
      .post("/dice/bet")
      .set("x-user-id", "player-1")
      .set("x-operator-id", "op-test")
      .set("x-currency", "USD")
      .send({ betAmount: "100", target: 50, condition: "under" })
      .expect(201);

    expect(response.body.roundId).toBeDefined();
    expect(response.body.payoutAmount).toBeDefined();

    const rounds = await dbClient.query(`SELECT * FROM game_rounds WHERE id = $1`, [response.body.roundId]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].status).toBe("SETTLED");

    const txs = await dbClient.query(`SELECT * FROM wallet_transactions WHERE round_id = $1`, [response.body.roundId]);
    expect(txs.length).toBeGreaterThanOrEqual(1);
  });
});
