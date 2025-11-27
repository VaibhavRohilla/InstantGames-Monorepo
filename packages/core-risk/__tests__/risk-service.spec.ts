import { describe, expect, it } from "vitest";
import { AuthContext } from "@instant-games/core-auth";
import { GameConfig, IGameConfigService } from "@instant-games/core-config";
import { RiskService, RiskViolationError } from "@instant-games/core-risk";
import { IKeyValueStore, serializeForRedis, deserializeFromRedis } from "@instant-games/core-redis";

class StubConfigService implements IGameConfigService {
  constructor(private readonly config: GameConfig) {}
  async getConfig(): Promise<GameConfig> {
    return this.config;
  }
}

class MemoryKvStore implements IKeyValueStore {
  private store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    return deserializeFromRedis<T>(this.store.get(key) ?? null);
  }

  async set<T>(key: string, value: T): Promise<void> {
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

const ctx: AuthContext = {
  userId: "user-1",
  operatorId: "op-1",
  currency: "USD",
  mode: "demo",
};

describe("RiskService rate limiting", () => {
  it("enforces bet rate limits atomically", async () => {
    const config: GameConfig = {
      game: "dice",
      operatorId: ctx.operatorId,
      currency: ctx.currency,
      mode: ctx.mode,
      minBet: BigInt(1),
      maxBet: BigInt(1000),
      maxPayoutPerRound: BigInt(10000),
      mathVersion: "v1",
      demoEnabled: true,
      realEnabled: true,
      features: {},
      extra: { betsPerWindow: 2, betsPerWindowMs: 1000 },
    };
    const riskService = new RiskService(new StubConfigService(config), new MemoryKvStore());

    await riskService.validateBet({ ctx, game: "dice", betAmount: BigInt(10), potentialPayout: BigInt(20) });
    await riskService.validateBet({ ctx, game: "dice", betAmount: BigInt(10), potentialPayout: BigInt(20) });
    await expect(
      riskService.validateBet({ ctx, game: "dice", betAmount: BigInt(10), potentialPayout: BigInt(20) })
    ).rejects.toBeInstanceOf(RiskViolationError);
  });
});

