import { INestApplication } from "@nestjs/common";
import { describe, beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { CoinflipController } from "../src/coinflip.controller";
import { CoinflipService } from "../src/coinflip.service";
import { HealthController } from "../src/health.controller";
import { createGameTestHarness, seedGameConfig, seedOperator } from "../../test-utils/game-test-harness";
import { createTestAuthToken } from "../../test-utils/auth-helpers";
import { IRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { ProvablyFairContext } from "@instant-games/core-provably-fair";
import { WALLET_ROUTER, WalletRouter, scopeWalletUserId } from "@instant-games/core-wallet";

class TestRngService implements IRngService {
  private fallback = 0.25;
  private queue: number[] = [];

  setNext(value: number): void {
    this.queue = [value];
  }

  rollFloat(_ctx: ProvablyFairContext, _nonce: number): number {
    return this.consume();
  }

  rollInt(_ctx: ProvablyFairContext, _nonce: number, min: number, max: number): number {
    const clamped = Math.min(Math.max(this.consume(), 0), 0.999999);
    const span = max - min + 1;
    return min + Math.floor(clamped * span);
  }

  private consume(): number {
    if (this.queue.length > 0) {
      this.fallback = this.queue.shift()!;
    }
    return this.fallback;
  }
}

describe("CoinFlip API flow", () => {
  const game = "coinflip";
  const operatorId = "op-coinflip-flow";
  const userId = "player-coinflip-flow";
  const currency = "USD";
  const mode = "demo" as const;
  const betPath = "/coinflip/bet";
  const healthPath = "/coinflip/health";
  const baseBetAmount = "5000";
  const scopedUserId = scopeWalletUserId(operatorId, userId);

  let app: INestApplication;
  let rng: TestRngService;
  let walletRouter: WalletRouter;

  beforeAll(async () => {
    const harness = await createGameTestHarness({
      controller: [CoinflipController, HealthController],
      service: CoinflipService,
      overrides: [{ provide: RNG_SERVICE, useClass: TestRngService }],
    });

    app = harness.app;
    rng = app.get<TestRngService>(RNG_SERVICE);
    walletRouter = app.get(WALLET_ROUTER);

    await seedOperator(harness.dbClient, operatorId);
    await seedGameConfig({ db: harness.dbClient, operatorId, game, currency, mode: "demo" });
    await seedGameConfig({ db: harness.dbClient, operatorId, game, currency, mode: "real" });

    await walletRouter.resolve(mode).credit(scopedUserId, BigInt(1_000_000), currency, mode);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("settles winning bets and credits payouts", async () => {
    const before = await getDemoBalance();
    rng.setNext(0.1); // HEADS

    const res = await sendBet("coinflip-win");
    expect(res.body.isWin).toBe(true);
    expect(res.body.outcome).toBe("HEADS");

    const betAmount = BigInt(baseBetAmount);
    const payout = BigInt(res.body.payoutAmount);
    expect(payout).toBeGreaterThan(0n);

    const after = await getDemoBalance();
    expect(after).toEqual(before - betAmount + payout);
  });

  it("settles losing bets and only debits the stake", async () => {
    const before = await getDemoBalance();
    rng.setNext(0.9); // TAILS

    const res = await sendBet("coinflip-lose");
    expect(res.body.isWin).toBe(false);
    expect(res.body.outcome).toBe("TAILS");
    expect(BigInt(res.body.payoutAmount)).toBe(0n);

    const after = await getDemoBalance();
    expect(after).toEqual(before - BigInt(baseBetAmount));
  });

  it("returns cached results for identical idempotency keys", async () => {
    rng.setNext(0.2);
    const first = await sendBet("coinflip-idem");
    const balanceAfterFirst = await getDemoBalance();

    rng.setNext(0.95); // would lose if executed again
    const second = await sendBet("coinflip-idem");
    const balanceAfterSecond = await getDemoBalance();

    expect(second.body.roundId).toBe(first.body.roundId);
    expect(second.body.payoutAmount).toBe(first.body.payoutAmount);
    expect(balanceAfterSecond).toEqual(balanceAfterFirst);
  });

  it("rejects invalid side input without affecting wallet", async () => {
    const before = await getDemoBalance();
    rng.setNext(0.05);

    await sendBet("coinflip-invalid-side", { side: "edge" }, 400);
    const after = await getDemoBalance();
    expect(after).toEqual(before);
  });

  it("reports healthy dependencies", async () => {
    const res = await request(app.getHttpServer()).get(healthPath).expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks).toMatchObject({
      database: { ok: true },
      redis: { ok: true },
      wallet: { ok: true },
    });
  });

  async function sendBet(
    idempotencyKey: string,
    overrides: Record<string, unknown> = {},
    expectedStatus = 201,
  ) {
    const token = createTestAuthToken({
      userId,
      operatorId,
      currency,
      mode,
    });

    return request(app.getHttpServer())
      .post(betPath)
      .set("Authorization", `Bearer ${token}`)
      .set("x-idempotency-key", idempotencyKey)
      .send({
        betAmount: baseBetAmount,
        side: "heads",
        ...overrides,
      })
      .expect(expectedStatus);
  }

  function demoWallet() {
    return walletRouter.resolve(mode);
  }

  async function getDemoBalance(): Promise<bigint> {
    return demoWallet().getBalance(scopedUserId, currency, mode);
  }
});

