import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { DiceController } from "../src/dice.controller";
import { DiceService } from "../src/dice.service";
import { AuthModule } from "@instant-games/core-auth";
import { ProvablyFairService, PROVABLY_FAIR_SERVICE, PROVABLY_FAIR_STATE_STORE, RedisProvablyFairStateStore, PfRotationService, PF_ROTATION_SERVICE } from "@instant-games/core-provably-fair";
import { ProvablyFairRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { GAME_CONFIG_SERVICE, DbGameConfigService } from "@instant-games/core-config";
import { GameRoundRepository, GAME_ROUND_REPOSITORY } from "@instant-games/core-game-history";
import { WalletTransactionRepository, WALLET_TRANSACTION_REPOSITORY } from "@instant-games/core-ledger";
import { DemoWalletService, DbWalletService, WalletRouter, WALLET_ROUTER, scopeWalletUserId } from "@instant-games/core-wallet";
import { IDEMPOTENCY_STORE, RedisIdempotencyStore } from "@instant-games/core-idempotency";
import { LOGGER } from "@instant-games/core-logging";
import { METRICS } from "@instant-games/core-metrics";
import { NoopBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { GameBetRunner } from "@instant-games/core-game-slice";
import { RiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { InMemoryStore, createDbClient, NoopLockManager, InMemoryLogger, NoopMetrics } from "apps/test-utils/test-helpers";
import { createTestAuthToken } from "apps/test-utils/auth-helpers";

describe("Dice API e2e", () => {
  let app: INestApplication;
  let dbClient: IDbClient;
  let kvStore: InMemoryStore;
  const operatorId = "op-test";
  const currency = "USD";

  const getAuthHeader = (userId: string, mode: "demo" | "real" = "demo") =>
    `Bearer ${createTestAuthToken({ userId, operatorId, currency, mode })}`;

  beforeAll(async () => {
    dbClient = await createDbClient();
    kvStore = new InMemoryStore();

    await dbClient.query(`INSERT INTO operators (id, name) VALUES ($1, $2)`, [operatorId, "Test Operator"]);
    for (const mode of ["demo", "real"] as const) {
      await dbClient.query(
        `INSERT INTO game_configs (id, operator_id, game, currency, mode, min_bet, max_bet, max_payout_per_round, math_version, extra)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [randomUUID(), operatorId, "dice", currency, mode, "100", "100000", "1000000", "v1", JSON.stringify({})]
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [DiceController],
      providers: [
        GameBetRunner,
        DiceService,
        { provide: PROVABLY_FAIR_SERVICE, useClass: ProvablyFairService },
        {
          provide: PF_ROTATION_SERVICE,
          useFactory: (db: IDbClient, pf: ProvablyFairService) => new PfRotationService(db, pf),
          inject: [DB_CLIENT, PROVABLY_FAIR_SERVICE],
        },
        {
          provide: PROVABLY_FAIR_STATE_STORE,
          useFactory: (rotation: PfRotationService) => new RedisProvablyFairStateStore(kvStore, rotation),
          inject: [PF_ROTATION_SERVICE],
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
          useFactory: () => {
            const lockManager = new NoopLockManager();
            const demoWallet = new DemoWalletService(kvStore, lockManager);
            const dbWallet = new DbWalletService(dbClient, lockManager);
            return new WalletRouter(demoWallet, dbWallet);
          },
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
        { provide: DB_CLIENT, useValue: dbClient },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const walletRouter = app.get<WalletRouter>(WALLET_ROUTER);
    await walletRouter.resolve("demo").credit(scopeWalletUserId(operatorId, "player-1"), BigInt(1000), currency, "demo");
    await walletRouter.resolve("real").credit(scopeWalletUserId(operatorId, "player-2"), BigInt(2000), currency, "real");
  });

afterAll(async () => {
  if (app) {
    await app.close();
  }
});

  it("places and settles a dice bet", async () => {
    const response = await request(app.getHttpServer())
      .post("/dice/bet")
      .set("Authorization", getAuthHeader("player-1"))
      .set("x-idempotency-key", "idem-1")
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

  it("settles real-money bets against the DB wallet", async () => {
    const response = await request(app.getHttpServer())
      .post("/dice/bet")
      .set("Authorization", getAuthHeader("player-2", "real"))
      .set("x-idempotency-key", "idem-real-1")
      .send({ betAmount: "500", target: 55, condition: "under" })
      .expect(201);

    const [walletRow] = await dbClient.query(
      `SELECT balance FROM wallet_balances WHERE operator_id = $1 AND user_id = $2 AND currency = $3 AND mode = $4`,
      [operatorId, "player-2", currency, "real"]
    );
    expect(walletRow).toBeDefined();
    const ledgerRows = await dbClient.query(`SELECT * FROM wallet_transactions WHERE round_id = $1 ORDER BY created_at`, [
      response.body.roundId,
    ]);
    expect(ledgerRows.length).toBeGreaterThanOrEqual(1);

    const round = await dbClient.query(`SELECT * FROM game_rounds WHERE id = $1`, [response.body.roundId]);
    expect(round).toHaveLength(1);
    expect(BigInt(walletRow.balance)).toBeGreaterThanOrEqual(BigInt(0));
  });

  it("rejects bets when mode is disabled", async () => {
    await dbClient.query(`UPDATE game_configs SET demo_enabled = FALSE WHERE operator_id = $1`, [operatorId]);
    await kvStore.del(`config:${operatorId}:dice:${currency}:demo`);

    await request(app.getHttpServer())
      .post("/dice/bet")
      .set("Authorization", getAuthHeader("player-1"))
      .set("x-idempotency-key", "idem-2")
      .send({ betAmount: "100", target: 50, condition: "under" })
      .expect(403);

    await dbClient.query(`UPDATE game_configs SET demo_enabled = TRUE WHERE operator_id = $1`, [operatorId]);
    await kvStore.del(`config:${operatorId}:dice:${currency}:demo`);
  });

  it("returns cached response for duplicate idempotency keys", async () => {
    const responseA = await request(app.getHttpServer())
      .post("/dice/bet")
      .set("Authorization", getAuthHeader("player-1"))
      .set("x-idempotency-key", "idem-3")
      .send({ betAmount: "100", target: 55, condition: "under" })
      .expect(201);

    const responseB = await request(app.getHttpServer())
      .post("/dice/bet")
      .set("Authorization", getAuthHeader("player-1"))
      .set("x-idempotency-key", "idem-3")
      .send({ betAmount: "100", target: 55, condition: "under" })
      .expect(201);

    expect(responseB.body.roundId).toBe(responseA.body.roundId);
  });

  it("uses new server seeds after rotation", async () => {
    const rotation = app.get<PfRotationService>(PF_ROTATION_SERVICE);

    const firstBet = await request(app.getHttpServer())
      .post("/dice/bet")
      .set("Authorization", getAuthHeader("player-1"))
      .set("x-idempotency-key", "idem-rot-a")
      .send({ betAmount: "150", target: 60, condition: "under" })
      .expect(201);

    await rotation.rotateServerSeed({ operatorId, game: "dice", mode: "demo" });

    const secondBet = await request(app.getHttpServer())
      .post("/dice/bet")
      .set("Authorization", getAuthHeader("player-1"))
      .set("x-idempotency-key", "idem-rot-b")
      .send({ betAmount: "150", target: 60, condition: "under" })
      .expect(201);

    expect(secondBet.body.serverSeedHash).not.toBe(firstBet.body.serverSeedHash);
  });
});
