import { IKeyValueStore } from "@instant-games/core-redis";

export interface IIdempotencyStore {
  performOrGetCached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
}

export const IDEMPOTENCY_STORE = Symbol("IDEMPOTENCY_STORE");

export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly store: IKeyValueStore) {}

  async performOrGetCached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.store.get<{ payload: T }>(`idem:${key}`);
    if (cached) {
      return cached.payload;
    }

    const result = await fn();
    await this.store.set(`idem:${key}`, { payload: result }, ttlSeconds);
    return result;
  }
}
