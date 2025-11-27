import { describe, expect, it } from "vitest";
import { ProvablyFairService, RedisProvablyFairStateStore } from "@instant-games/core-provably-fair";
import { IKeyValueStore, serializeForRedis, deserializeFromRedis } from "@instant-games/core-redis";

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

describe("RedisProvablyFairStateStore", () => {
  it("isolates PF contexts per operator and mode", async () => {
    const service = new ProvablyFairService();
    const kv = new MemoryKvStore();
    const store = new RedisProvablyFairStateStore(kv, service);

    const ctxA = await store.getOrInitContext({ operatorId: "opA", mode: "demo", userId: "user1", game: "dice" });
    const ctxB = await store.getOrInitContext({ operatorId: "opB", mode: "demo", userId: "user1", game: "dice" });

    expect(ctxA.serverSeedHash).not.toEqual(ctxB.serverSeedHash);
  });

  it("increments nonce atomically", async () => {
    const service = new ProvablyFairService();
    const kv = new MemoryKvStore();
    const store = new RedisProvablyFairStateStore(kv, service);

    await store.getOrInitContext({ operatorId: "opA", mode: "demo", userId: "user2", game: "dice" });
    const [first, second] = await Promise.all([
      store.nextNonce({ operatorId: "opA", mode: "demo", userId: "user2", game: "dice" }),
      store.nextNonce({ operatorId: "opA", mode: "demo", userId: "user2", game: "dice" }),
    ]);

    expect(new Set([first, second]).size).toBe(2);
  });
});

