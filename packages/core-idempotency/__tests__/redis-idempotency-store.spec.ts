import { describe, expect, it, vi } from "vitest";
import { RedisIdempotencyStore } from "@instant-games/core-idempotency";
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

describe("RedisIdempotencyStore", () => {
  it("executes once and shares cached payload", async () => {
    const kv = new MemoryKvStore();
    const store = new RedisIdempotencyStore(kv, 5);
    const handler = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ts: Date.now() };
    });

    const [first, second] = await Promise.all([
      store.performOrGetCached("test", 2, handler),
      store.performOrGetCached("test", 2, handler),
    ]);

    expect(first).toEqual(second);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

