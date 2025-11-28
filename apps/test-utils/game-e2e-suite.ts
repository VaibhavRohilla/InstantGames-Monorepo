import { INestApplication, Type } from "@nestjs/common";
import request from "supertest";
import { WALLET_ROUTER, WalletRouter, scopeWalletUserId } from "@instant-games/core-wallet";
import { GameName } from "@instant-games/core-types";
import { createGameTestHarness, seedGameConfig, seedOperator } from "./game-test-harness";
import { createTestAuthToken } from "./auth-helpers";

export interface GameE2EOptions {
  title: string;
  game: GameName;
  path: string;
  controller: Type<any>;
  service: Type<any>;
  buildBetBody(): Record<string, unknown>;
}

export function registerGameE2ESuite(options: GameE2EOptions) {
  describe(options.title, () => {
    const operatorId = `op-${options.game}`;
    const userId = `player-${options.game}`;
    const currency = "USD";
    let app: INestApplication;
    let dbClient: ReturnType<typeof createGameTestHarness> extends Promise<infer R> ? R["dbClient"] : never;
    let kvStore: ReturnType<typeof createGameTestHarness> extends Promise<infer R> ? R["kvStore"] : never;

    beforeAll(async () => {
      const harness = await createGameTestHarness({ controller: options.controller, service: options.service });
      app = harness.app;
      dbClient = harness.dbClient;
      kvStore = harness.kvStore;

      await seedOperator(dbClient, operatorId);
      await seedGameConfig({ db: dbClient, operatorId, game: options.game, currency, mode: "demo" });
      await seedGameConfig({ db: dbClient, operatorId, game: options.game, currency, mode: "real" });

      const walletRouter = app.get<WalletRouter>(WALLET_ROUTER);
      await walletRouter.resolve("demo").credit(scopeWalletUserId(operatorId, userId), BigInt(1_000_000), currency, "demo");
    });

    afterAll(async () => {
      if (app) {
        await app.close();
      }
    });

    it("places and settles a demo bet", async () => {
      const betBody = options.buildBetBody();
      const token = createTestAuthToken({
        userId,
        operatorId,
        currency,
        mode: "demo",
      });
      const res = await request(app.getHttpServer())
        .post(options.path)
        .set("Authorization", `Bearer ${token}`)
        .set("x-idempotency-key", `${options.game}-bet-1`)
        .send(betBody)
        .expect(201);

      expect(res.body.roundId).toBeDefined();

      const rounds = await dbClient.query(`SELECT * FROM game_rounds WHERE id = $1`, [res.body.roundId]);
      expect(rounds).toHaveLength(1);
      expect(rounds[0].game).toBe(options.game);

      const txs = await dbClient.query(`SELECT * FROM wallet_transactions WHERE round_id = $1 ORDER BY created_at`, [
        res.body.roundId,
      ]);
      expect(txs.length).toBeGreaterThanOrEqual(1);
    });

    it("enforces mode gating", async () => {
      await dbClient.query(`UPDATE game_configs SET demo_enabled = FALSE WHERE operator_id = $1 AND game = $2 AND mode = $3`, [
        operatorId,
        options.game,
        "demo",
      ]);
      await kvStore.del(`config:${operatorId}:${options.game}:${currency}:demo`);

      const token = createTestAuthToken({
        userId,
        operatorId,
        currency,
        mode: "demo",
      });
      await request(app.getHttpServer())
        .post(options.path)
        .set("Authorization", `Bearer ${token}`)
        .set("x-idempotency-key", `${options.game}-mode`)
        .send(options.buildBetBody())
        .expect(403);

      await dbClient.query(`UPDATE game_configs SET demo_enabled = TRUE WHERE operator_id = $1 AND game = $2 AND mode = $3`, [
        operatorId,
        options.game,
        "demo",
      ]);
      await kvStore.del(`config:${operatorId}:${options.game}:${currency}:demo`);
    });

    it("caches idempotent requests", async () => {
      const betBody = options.buildBetBody();
      const key = `${options.game}-idem`;
      const token = createTestAuthToken({
        userId,
        operatorId,
        currency,
        mode: "demo",
      });

      const first = await request(app.getHttpServer())
        .post(options.path)
        .set("Authorization", `Bearer ${token}`)
        .set("x-idempotency-key", key)
        .send(betBody)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(options.path)
        .set("Authorization", `Bearer ${token}`)
        .set("x-idempotency-key", key)
        .send(betBody)
        .expect(201);

      expect(second.body.roundId).toBe(first.body.roundId);
    });

    it("applies risk checks for low bets", async () => {
      await dbClient.query(
        `UPDATE game_configs SET min_bet = $1 WHERE operator_id = $2 AND game = $3 AND currency = $4 AND mode = $5`,
        ["1000", operatorId, options.game, currency, "demo"]
      );
      await kvStore.del(`config:${operatorId}:${options.game}:${currency}:demo`);

      const body = { ...options.buildBetBody(), betAmount: "10" };
      const token = createTestAuthToken({
        userId,
        operatorId,
        currency,
        mode: "demo",
      });
      await request(app.getHttpServer())
        .post(options.path)
        .set("Authorization", `Bearer ${token}`)
        .set("x-idempotency-key", `${options.game}-risk`)
        .send(body)
        .expect(400);

      await dbClient.query(
        `UPDATE game_configs SET min_bet = $1 WHERE operator_id = $2 AND game = $3 AND currency = $4 AND mode = $5`,
        ["100", operatorId, options.game, currency, "demo"]
      );
      await kvStore.del(`config:${operatorId}:${options.game}:${currency}:demo`);
    });
  });
}

