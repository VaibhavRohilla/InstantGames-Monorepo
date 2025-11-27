import { describe, expect, it } from "vitest";
import { AuthContext } from "@instant-games/core-auth";
import { DbGameConfigService, GameConfig } from "@instant-games/core-config";
import { IDbClient } from "@instant-games/core-db";
import { IKeyValueStore, deserializeFromRedis, serializeForRedis } from "@instant-games/core-redis";

class FakeDbClient implements IDbClient {
  public queryCount = 0;
  constructor(private readonly row: Record<string, unknown>) {}

  async query<T = any>(_sql: string, _params?: any[]): Promise<T[]> {
    this.queryCount += 1;
    return [this.row] as T[];
  }

  async transaction<T>(_fn: (tx: IDbClient) => Promise<T>): Promise<T> {
    throw new Error("Not implemented");
  }
}

class InMemoryKvStore implements IKeyValueStore {
  private readonly store = new Map<string, string>();

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

describe("DbGameConfigService", () => {
  const ctx: AuthContext = {
    userId: "u1",
    operatorId: "op1",
    currency: "USD",
    mode: "demo",
  };

  const dbRow = {
    operator_id: ctx.operatorId,
    game: "dice",
    currency: ctx.currency,
    mode: ctx.mode,
    min_bet: "1000",
    max_bet: "1000000",
    max_payout_per_round: "2000000",
    volatility_profile: null,
    math_version: "v1",
    demo_enabled: true,
    real_enabled: false,
    features: {},
    extra: {},
  };

  it("returns cached config with bigint values intact", async () => {
    const db = new FakeDbClient(dbRow);
    const kv = new InMemoryKvStore();
    const service = new DbGameConfigService(db, kv, 60);

    const first = await service.getConfig({ ctx, game: "dice" });
    const second = await service.getConfig({ ctx, game: "dice" });

    expect(db.queryCount).toBe(1);
    expect(typeof first.minBet).toBe("bigint");
    expect(typeof second.maxPayoutPerRound).toBe("bigint");
    expect((first as GameConfig).minBet).toEqual(second.minBet);
  });
});

