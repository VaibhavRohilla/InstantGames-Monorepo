import { IKeyValueStore } from "@instant-games/core-redis";
export interface IIdempotencyStore {
    performOrGetCached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
}
export declare const IDEMPOTENCY_STORE: unique symbol;
export declare class RedisIdempotencyStore implements IIdempotencyStore {
    private readonly store;
    constructor(store: IKeyValueStore);
    performOrGetCached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
}
