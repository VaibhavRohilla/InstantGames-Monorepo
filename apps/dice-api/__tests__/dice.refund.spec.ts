import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, beforeAll, afterAll, it, expect, vi } from "vitest";
import { DiceController } from "../src/dice.controller";
import { DiceService } from "../src/dice.service";
import { AuthModule } from "@instant-games/core-auth";
import { ProvablyFairService, PROVABLY_FAIR_SERVICE, PROVABLY_FAIR_STATE_STORE, RedisProvablyFairStateStore, PfRotationService, PF_ROTATION_SERVICE } from "@instant-games/core-provably-fair";
import { ProvablyFairRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { GAME_CONFIG_SERVICE, DbGameConfigService } from "@instant-games/core-config";
import { WALLET_TRANSACTION_REPOSITORY, WalletTransactionRepository } from "@instant-games/core-ledger";
import { DemoWalletService, DbWalletService, WalletRouter, WALLET_ROUTER, scopeWalletUserId } from "@instant-games/core-wallet";
import { IDEMPOTENCY_STORE, RedisIdempotencyStore } from "@instant-games/core-idempotency";
import { LOGGER } from "@instant-games/core-logging";
import { METRICS } from "@instant-games/core-metrics";
import { NoopBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { RiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { InMemoryLogger, InMemoryStore, NoopLockManager, NoopMetrics, createDbClient } from "./test-helpers";

const failControl = { next: false };

vi.mock("@instant-games/core-game-history", async () => {
  const actual = await vi.importActual<typeof import("@instant-games/core-game-history")>("@instant-games/core-game-history");
  class FailingGameRoundRepository extends actual.GameRoundRepository {
    async markSettled(id: string, payoutAmount: bigint, metaUpdate: Record<string, unknown> = {}) {
      if (failControl.next) {
        failControl.next = false;
        throw new Error("FORCED_SETTLEMENT_FAILURE");
      }
      return super.markSettled(id, payoutAmount, metaUpdate);
    }
  }

  return {
    ...actual,
    GameRoundRepository: FailingGameRoundRepository,
    __triggerSettlementFailure: () => {
      failControl.next = true;
    },
  };
});

describe("Dice API refunds", () => {
  let app: INestApplication;
  let dbClient: IDbClient;
  let kvStore: InMemoryStore;
  let triggerSettlementFailure: () => void;

  beforeAll(async () => {
    const moduleExports = (await import("@instant-games/core-game-history")) as Record<string, unknown>;
    triggerSettlementFailure = moduleExports.__triggerSettlementFailure as () => void;

    dbClient = await createDbClient();
    kvStore = new InMemoryStore();

    await dbClient.query(`INSERT INTO operators (id, name) VALUES ($1,$2)`, ["op-refund", "Refund Operator"]);
    await dbClient.query(
      `INSERT INTO game_configs (operator_id, game, currency, mode, min_bet, max_bet, max_payout_per_round, math_version, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      ["op-refund", "dice", "USD", "real", "100", "100000", "1000000", "v1", JSON.stringify({})]
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [DiceController],
      providers: [
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
          useFactory: (pf: ProvablyFairService) => new ProvablyFairRngService(pf),
          inject: [PROVABLY_FAIR_SERVICE],
        },
        {
          provide: GAME_CONFIG_SERVICE,
          useFactory: () => new DbGameConfigService(dbClient, kvStore),
        },
        {
          provide: WALLET_TRANSACTION_REPOSITORY,
          useFactory: () => new WalletTransactionRepository(dbClient),
        },
        {
          provide: WALLET_ROUTER,
          useFactory: () => {
            const lock = new NoopLockManager();
            const demoWallet = new DemoWalletService(kvStore, lock);
            const dbWallet = new DbWalletService(dbClient, lock);
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
    await walletRouter.resolve("real").credit(scopeWalletUserId("op-refund", "user-refund"), BigInt(1000), "USD", "real");
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("refunds wallet balances when settlement fails mid-transaction", async () => {
    triggerSettlementFailure();

    await request(app.getHttpServer())
      .post("/dice/bet")
      .set("x-user-id", "user-refund")
      .set("x-operator-id", "op-refund")
      .set("x-currency", "USD")
      .set("x-game-mode", "real")
      .set("x-idempotency-key", "idem-refund-1")
      .send({ betAmount: "400", target: 55, condition: "under" })
      .expect(500);

    const [walletRow] = await dbClient.query(
      `SELECT balance FROM wallet_balances WHERE operator_id = $1 AND user_id = $2 AND currency = $3 AND mode = $4`,
      ["op-refund", "user-refund", "USD", "real"]
    );
    expect(BigInt(walletRow.balance)).toBe(BigInt(1000));

    const refundTx = await dbClient.query(
      `SELECT * FROM wallet_transactions WHERE operator_id = $1 AND user_id = $2 AND type = 'REFUND' ORDER BY created_at DESC LIMIT 1`,
      ["op-refund", "user-refund"]
    );
    expect(refundTx).toHaveLength(1);

    const cancelledRound = await dbClient.query(
      `SELECT status FROM game_rounds WHERE operator_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      ["op-refund", "user-refund"]
    );
    expect(cancelledRound[0]?.status).toBe("CANCELLED");
  });
});

