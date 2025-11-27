import { IKeyValueStore } from "@instant-games/core-redis";

export interface PerformOptions<T> {
  onCached?: (cached: T) => void;
}

export interface IIdempotencyStore {
  performOrGetCached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>, options?: PerformOptions<T>): Promise<T>;
}

export const IDEMPOTENCY_STORE = Symbol("IDEMPOTENCY_STORE");

export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly store: IKeyValueStore, private readonly pollIntervalMs = 50) {}

  async performOrGetCached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>, options?: PerformOptions<T>): Promise<T> {
    const cacheKey = `idem:${key}`;
    const lockKey = `idem:lock:${key}`;

    const cached = await this.store.get<{ payload: T }>(cacheKey);
    if (cached) {
      options?.onCached?.(cached.payload);
      return cached.payload;
    }

    const acquired = await this.store.setNx(lockKey, "1", ttlSeconds);
    if (!acquired) {
      const timeoutAt = Date.now() + ttlSeconds * 1000;
      while (Date.now() < timeoutAt) {
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        const existing = await this.store.get<{ payload: T }>(cacheKey);
        if (existing) {
          return existing.payload;
        }
      }
      throw new Error("IDEMPOTENCY_IN_PROGRESS");
    }

    try {
      const result = await fn();
      await this.store.set(cacheKey, { payload: result }, ttlSeconds);
      return result;
    } finally {
      await this.store.del(lockKey);
    }
  }
}
