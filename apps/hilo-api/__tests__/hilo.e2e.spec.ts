import { beforeEach, describe, expect, it } from "vitest";
import { HiloService } from "../src/hilo.service";
import { HiloConfigService } from "../src/hilo.config";
import { HiloGuessDto } from "../src/dto/hilo-guess.dto";
import { HiloStartDto } from "../src/dto/hilo-bet.dto";
import {
  InMemoryLogger,
  InMemoryStore,
  NoopLockManager,
  NoopMetrics,
  createDbClient,
  seedGameConfig,
  seedOperator,
} from "./test-support";
import { DbGameConfigService } from "@instant-games/core-config";
import { PfRotationService, ProvablyFairService, RedisProvablyFairStateStore } from "@instant-games/core-provably-fair";
import { ProvablyFairRngService } from "@instant-games/core-rng";
import { DemoWalletService, DbWalletService, WalletRouter, scopeWalletUserId } from "@instant-games/core-wallet";
import { RedisIdempotencyStore } from "@instant-games/core-idempotency";
import { RiskService } from "@instant-games/core-risk";
import { NoopBonusPort } from "@instant-games/core-bonus";
import { AuthContext } from "@instant-games/core-auth";
import { Card } from "@instant-games/game-math-hilo";
import { IDbClient } from "@instant-games/core-db";
import { HealthController } from "../src/health.controller";

describe("HiloService", () => {
  const operatorId = "op-hilo";
  const userId = "player-hilo";
  const currency = "USD";
  const ctx: AuthContext = { operatorId, userId, currency, mode: "demo" };

  let service: HiloService;
  let kvStore: InMemoryStore;
  let dbClient: IDbClient;
  let walletRouter: WalletRouter;

  beforeEach(async () => {
    dbClient = await createDbClient();
    kvStore = new InMemoryStore();
    const lockManager = new NoopLockManager();
    const logger = new InMemoryLogger();
    const metrics = new NoopMetrics();

    await seedOperator(dbClient, operatorId);
    await seedGameConfig({
      db: dbClient,
      operatorId,
  game: "hilo",
      currency,
      mode: "demo",
      extra: { maxSteps: 3, multipliers: [1.5, 2.4, 3.8] },
    });

    const configService = new DbGameConfigService(dbClient, kvStore);
    const hiloConfig = new HiloConfigService(configService);
    const pfService = new ProvablyFairService();
    const rotation = new PfRotationService(dbClient, pfService);
    const pfStore = new RedisProvablyFairStateStore(kvStore, rotation);
    const rngService = new ProvablyFairRngService(pfService);
    const demoWallet = new DemoWalletService(kvStore, lockManager);
    const dbWallet = new DbWalletService(dbClient, lockManager);
    walletRouter = new WalletRouter(demoWallet, dbWallet, { allowDemoFallback: true });
    const idempotencyStore = new RedisIdempotencyStore(kvStore);
    const riskService = new RiskService(configService, kvStore);
    const bonusPort = new NoopBonusPort();

    // credit balance
    await walletRouter.resolve("demo").credit(scopeWalletUserId(operatorId, userId), BigInt(1_000_000), currency, "demo");

    service = new HiloService(
      hiloConfig,
      pfStore,
      rngService,
      walletRouter,
      kvStore,
      lockManager,
      idempotencyStore,
      riskService,
      bonusPort,
      dbClient,
      logger,
      metrics,
    );
  });

  it("performs start -> multi guess -> cashout", async () => {
    const startResponse = await service.startRound(ctx, buildStartDto("1000"), "idem-start");
    expect(startResponse.roundId).toBeDefined();

    await rigRound([
      { rank: 6, suit: "clubs" },
      { rank: 12, suit: "spades" },
      { rank: 13, suit: "hearts" },
    ]);

    const firstGuess = await service.guess(ctx, buildGuessDto("higher"), "idem-guess-1");
    expect(firstGuess.result).toBe("win");
    expect(firstGuess.step).toBe(1);

    const secondGuess = await service.guess(ctx, buildGuessDto("higher"), "idem-guess-2");
    expect(secondGuess.result).toBe("win");
    expect(secondGuess.step).toBe(2);

    const cashout = await service.cashout(ctx, "idem-cashout");
    expect(cashout.status).toBe("cashed_out");
    expect(BigInt(cashout.winAmount)).toBeGreaterThan(0n);

    const rows = await dbClient.query(`SELECT status, payout_amount FROM game_rounds WHERE id = $1`, [cashout.roundId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("SETTLED");
    expect(BigInt(rows[0].payout_amount)).toBeGreaterThan(0n);
  });

  it("marks a round as lost when guess fails and blocks future actions", async () => {
    await service.startRound(ctx, buildStartDto("800"), "idem-start-lose");
    await rigRound([
      { rank: 10, suit: "diamonds" },
      { rank: 4, suit: "clubs" },
    ]);

    const loseResponse = await service.guess(ctx, buildGuessDto("higher"), "idem-lose");
    expect(loseResponse.result).toBe("lose");
    expect(loseResponse.status).toBe("lost");

    await expect(service.cashout(ctx, "idem-cashout-lose")).rejects.toThrow(/No active Hi-Lo round/);
    await expect(service.guess(ctx, buildGuessDto("higher"), "idem-after-lose")).rejects.toThrow(/active Hi-Lo round|no longer active/);
  });

  it("rejects cashout when no guesses have been made", async () => {
    await service.startRound(ctx, buildStartDto("1200"), "idem-start-zero");
    await expect(service.cashout(ctx, "idem-cashout-zero")).rejects.toThrow(/No winnings to cash out/);
  });

  it("rejects cashout after a previous cashout", async () => {
    await service.startRound(ctx, buildStartDto("900"), "idem-start-cashout-repeat");
    await rigRound([
      { rank: 5, suit: "clubs" },
      { rank: 11, suit: "spades" },
    ]);
    await service.guess(ctx, buildGuessDto("higher"), "idem-guess-cashout-repeat");
    await service.cashout(ctx, "idem-cashout-repeat");
    await expect(service.cashout(ctx, "idem-cashout-repeat-2")).rejects.toThrow(/No active Hi-Lo round/);
  });

  it("is idempotent for start, guess, and cashout", async () => {
    const roundA = await service.startRound(ctx, buildStartDto("1000"), "same-start");
    const roundB = await service.startRound(ctx, buildStartDto("1000"), "same-start");
    expect(roundB.roundId).toEqual(roundA.roundId);

    await rigRound([
      { rank: 7, suit: "clubs" },
      { rank: 12, suit: "diamonds" },
    ]);

    const guessFirst = await service.guess(ctx, buildGuessDto("higher"), "same-guess");
    const guessSecond = await service.guess(ctx, buildGuessDto("higher"), "same-guess");
    expect(guessSecond.step).toEqual(guessFirst.step);

    const cashFirst = await service.cashout(ctx, "same-cashout");
    const cashSecond = await service.cashout(ctx, "same-cashout");
    expect(cashSecond.winAmount).toEqual(cashFirst.winAmount);
  });

  it("rejects new guesses once the round is cashed out", async () => {
    await service.startRound(ctx, buildStartDto("950"), "idem-start-after-cash");
    await rigRound([
      { rank: 3, suit: "clubs" },
      { rank: 9, suit: "hearts" },
    ]);
    await service.guess(ctx, buildGuessDto("higher"), "idem-guess-after-cash");
    await service.cashout(ctx, "idem-cashout-after-cash");
    await expect(service.guess(ctx, buildGuessDto("higher"), "idem-guess-post-cash")).rejects.toThrow(
      /Round is no longer active/,
    );
  });

  it("reports health when Redis and DB are reachable", async () => {
    const controller = new HealthController();
    const result = await controller.health();
    expect(result).toEqual({ status: "ok" });
  });

  function buildStartDto(betAmount: string): HiloStartDto {
    return { betAmount };
  }

  function buildGuessDto(direction: string): HiloGuessDto {
    return { direction };
  }

  async function rigRound(cards: Card[]): Promise<void> {
    const key = `hilo:round:${operatorId}:demo:${userId}`;
    const record = await kvStore.get<any>(key);
    record.state.deck = [...cards, ...record.state.deck.slice(cards.length)];
    record.state.currentCard = cards[0];
    record.state.cursor = 0;
    await kvStore.set(key, record);
  }
});

