import { Redis } from "ioredis";
export interface IKeyValueStore {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
}
export interface ILockManager {
    withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}
export interface IPubSub {
    publish<T>(channel: string, payload: T): Promise<void>;
    subscribe<T>(channel: string, handler: (payload: T) => void): Promise<void>;
}
export declare const REDIS_CLIENT: unique symbol;
export declare const KEY_VALUE_STORE: unique symbol;
export declare const LOCK_MANAGER: unique symbol;
export declare const PUB_SUB: unique symbol;
export declare class RedisKeyValueStore implements IKeyValueStore {
    private readonly redis;
    constructor(redis: Redis);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
}
export declare class RedisLockManager implements ILockManager {
    private readonly redis;
    constructor(redis: Redis);
    withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}
export declare class RedisPubSub implements IPubSub {
    private readonly redis;
    private subscriber;
    constructor(redis: Redis);
    publish<T>(channel: string, payload: T): Promise<void>;
    subscribe<T>(channel: string, handler: (payload: T) => void): Promise<void>;
}
export interface RedisModuleOptions {
    url?: string;
    keyPrefix?: string;
}
export declare const redisModuleOptionsToken: unique symbol;
export declare class RedisModule {
    static forRoot(options?: RedisModuleOptions): {
        module: typeof RedisModule;
        providers: {
            provide: symbol;
            useValue: RedisModuleOptions;
        }[];
        exports: symbol[];
    };
}
