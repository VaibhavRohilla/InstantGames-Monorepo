import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { randomUUID } from "crypto";

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

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");
export const KEY_VALUE_STORE = Symbol("KEY_VALUE_STORE");
export const LOCK_MANAGER = Symbol("LOCK_MANAGER");
export const PUB_SUB = Symbol("PUB_SUB");

export class RedisKeyValueStore implements IKeyValueStore {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const result = await this.redis.get(key);
    if (!result) return null;
    return JSON.parse(result) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.set(key, payload, "EX", ttlSeconds);
    } else {
      await this.redis.set(key, payload);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

export class RedisLockManager implements ILockManager {
  constructor(private readonly redis: Redis) {}

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const acquired = await this.redis.set(key, token, "PX", ttlMs, "NX");
    if (!acquired) {
      throw new Error(`Failed to acquire lock for ${key}`);
    }

    try {
      return await fn();
    } finally {
      const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
      await this.redis.eval(script, 1, key, token);
    }
  }
}

export class RedisPubSub implements IPubSub {
  private subscriber: Redis;

  constructor(private readonly redis: Redis) {
    this.subscriber = redis.duplicate();
  }

  async publish<T>(channel: string, payload: T): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(payload));
  }

  async subscribe<T>(channel: string, handler: (payload: T) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on("message", (msgChannel, message) => {
      if (msgChannel !== channel) return;
      handler(JSON.parse(message));
    });
  }
}

export interface RedisModuleOptions {
  url?: string;
  keyPrefix?: string;
}

export const redisModuleOptionsToken = Symbol("REDIS_MODULE_OPTIONS");

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService, redisModuleOptionsToken],
      useFactory: (config: ConfigService, options?: RedisModuleOptions) => {
        const url = options?.url ?? config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
        const client = new Redis(url, {
          keyPrefix: options?.keyPrefix ?? config.get<string>("REDIS_KEY_PREFIX") ?? "ig:",
        });
        client.on("error", (err) => {
          console.error("Redis connection error", err);
        });
        return client;
      },
    },
    {
      provide: KEY_VALUE_STORE,
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => new RedisKeyValueStore(redis),
    },
    {
      provide: LOCK_MANAGER,
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => new RedisLockManager(redis),
    },
    {
      provide: PUB_SUB,
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => new RedisPubSub(redis),
    },
  ],
  exports: [REDIS_CLIENT, KEY_VALUE_STORE, LOCK_MANAGER, PUB_SUB],
})
export class RedisModule {
  static forRoot(options?: RedisModuleOptions) {
    return {
      module: RedisModule,
      providers: [
        {
          provide: redisModuleOptionsToken,
          useValue: options ?? {},
        },
      ],
      exports: [redisModuleOptionsToken],
    };
  }
}
