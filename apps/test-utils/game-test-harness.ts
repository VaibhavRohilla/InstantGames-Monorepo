import { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AuthModule } from "@instant-games/core-auth";
import { ProvablyFairService, PROVABLY_FAIR_SERVICE, PROVABLY_FAIR_STATE_STORE, RedisProvablyFairStateStore, PfRotationService, PF_ROTATION_SERVICE } from "@instant-games/core-provably-fair";
import { ProvablyFairRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { DbGameConfigService, GAME_CONFIG_SERVICE } from "@instant-games/core-config";
import { GameRoundRepository, GAME_ROUND_REPOSITORY } from "@instant-games/core-game-history";
import { WalletTransactionRepository, WALLET_TRANSACTION_REPOSITORY } from "@instant-games/core-ledger";
import { DemoWalletService, DbWalletService, WalletRouter, WALLET_ROUTER, DEMO_WALLET, DB_WALLET } from "@instant-games/core-wallet";
import { RedisIdempotencyStore, IDEMPOTENCY_STORE } from "@instant-games/core-idempotency";
import { RiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { NoopBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { KEY_VALUE_STORE, LOCK_MANAGER } from "@instant-games/core-redis";
import { LOGGER } from "@instant-games/core-logging";
import { METRICS } from "@instant-games/core-metrics";
import { IDbClient, DB_CLIENT } from "@instant-games/core-db";
import { GameBetRunner } from "@instant-games/core-game-slice";
import { InMemoryLogger, InMemoryStore, NoopLockManager, NoopMetrics, createDbClient, TEST_JWT_SECRET } from "./test-helpers";

// Set JWT secret for tests if not already set
if (!process.env.AUTH_JWT_SECRET) {
  process.env.AUTH_JWT_SECRET = TEST_JWT_SECRET;
  process.env.AUTH_JWT_ALGO = "HS256";
}

export interface GameTestHarness {
  app: INestApplication;
  dbClient: IDbClient;
  kvStore: InMemoryStore;
}

export interface GameTestHarnessOptions {
  controller: Type<any>;
  service: Type<any>;
}

export async function createGameTestHarness(options: GameTestHarnessOptions): Promise<GameTestHarness> {
  const dbClient = await createDbClient();
  const kvStore = new InMemoryStore();
  const lockManager = new NoopLockManager();

  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule],
    controllers: [options.controller],
    providers: [
      options.service,
      GameBetRunner,
      { provide: PROVABLY_FAIR_SERVICE, useClass: ProvablyFairService },
      {
        provide: PF_ROTATION_SERVICE,
        useFactory: (db: IDbClient, pf: ProvablyFairService) => new PfRotationService(db, pf),
        inject: [DB_CLIENT, PROVABLY_FAIR_SERVICE],
      },
      {
        provide: PROVABLY_FAIR_STATE_STORE,
        useFactory: (store: InMemoryStore, rotation: PfRotationService) => new RedisProvablyFairStateStore(store, rotation),
        inject: [KEY_VALUE_STORE, PF_ROTATION_SERVICE],
      },
      {
        provide: RNG_SERVICE,
        useFactory: (pf: ProvablyFairService) => new ProvablyFairRngService(pf),
        inject: [PROVABLY_FAIR_SERVICE],
      },
      {
        provide: GAME_CONFIG_SERVICE,
        useFactory: (db: IDbClient, store: InMemoryStore) => new DbGameConfigService(db, store),
        inject: [DB_CLIENT, KEY_VALUE_STORE],
      },
      {
        provide: GAME_ROUND_REPOSITORY,
        useFactory: (db: IDbClient) => new GameRoundRepository(db),
        inject: [DB_CLIENT],
      },
      {
        provide: WALLET_TRANSACTION_REPOSITORY,
        useFactory: (db: IDbClient) => new WalletTransactionRepository(db),
        inject: [DB_CLIENT],
      },
      {
        provide: DEMO_WALLET,
        useFactory: (store: InMemoryStore) => new DemoWalletService(store, lockManager),
        inject: [KEY_VALUE_STORE],
      },
      {
        provide: DB_WALLET,
        useFactory: (db: IDbClient) => new DbWalletService(db, lockManager),
        inject: [DB_CLIENT],
      },
      {
        provide: WALLET_ROUTER,
        useFactory: (demo: DemoWalletService, real: DbWalletService) => new WalletRouter(demo, real),
        inject: [DEMO_WALLET, DB_WALLET],
      },
      {
        provide: IDEMPOTENCY_STORE,
        useFactory: (store: InMemoryStore) => new RedisIdempotencyStore(store),
        inject: [KEY_VALUE_STORE],
      },
      {
        provide: RISK_SERVICE,
        useFactory: (cfg: DbGameConfigService, store: InMemoryStore) => new RiskService(cfg, store),
        inject: [GAME_CONFIG_SERVICE, KEY_VALUE_STORE],
      },
      { provide: BONUS_PORT, useClass: NoopBonusPort },
      { provide: KEY_VALUE_STORE, useValue: kvStore },
      { provide: LOCK_MANAGER, useValue: lockManager },
      { provide: LOGGER, useClass: InMemoryLogger },
      { provide: METRICS, useClass: NoopMetrics },
      { provide: DB_CLIENT, useValue: dbClient },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, dbClient, kvStore };
}

export async function seedOperator(db: IDbClient, operatorId: string, name = "Test Operator"): Promise<void> {
  await db.query(
    `INSERT INTO operators (id, name) VALUES ($1,$2)
     ON CONFLICT (id) DO NOTHING`,
    [operatorId, name]
  );
}

export interface SeedConfigParams {
  operatorId: string;
  game: string;
  currency: string;
  mode: "demo" | "real";
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
    ]
  );
}

