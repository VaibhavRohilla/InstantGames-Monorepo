"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RedisModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisModule = exports.redisModuleOptionsToken = exports.RedisPubSub = exports.RedisLockManager = exports.RedisKeyValueStore = exports.PUB_SUB = exports.LOCK_MANAGER = exports.KEY_VALUE_STORE = exports.REDIS_CLIENT = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
const crypto_1 = require("crypto");
exports.REDIS_CLIENT = Symbol("REDIS_CLIENT");
exports.KEY_VALUE_STORE = Symbol("KEY_VALUE_STORE");
exports.LOCK_MANAGER = Symbol("LOCK_MANAGER");
exports.PUB_SUB = Symbol("PUB_SUB");
class RedisKeyValueStore {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    async get(key) {
        const result = await this.redis.get(key);
        if (!result)
            return null;
        return JSON.parse(result);
    }
    async set(key, value, ttlSeconds) {
        const payload = JSON.stringify(value);
        if (ttlSeconds) {
            await this.redis.set(key, payload, "EX", ttlSeconds);
        }
        else {
            await this.redis.set(key, payload);
        }
    }
    async del(key) {
        await this.redis.del(key);
    }
}
exports.RedisKeyValueStore = RedisKeyValueStore;
class RedisLockManager {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    async withLock(key, ttlMs, fn) {
        const token = (0, crypto_1.randomUUID)();
        const acquired = await this.redis.set(key, token, "PX", ttlMs, "NX");
        if (!acquired) {
            throw new Error(`Failed to acquire lock for ${key}`);
        }
        try {
            return await fn();
        }
        finally {
            const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
            await this.redis.eval(script, 1, key, token);
        }
    }
}
exports.RedisLockManager = RedisLockManager;
class RedisPubSub {
    redis;
    subscriber;
    constructor(redis) {
        this.redis = redis;
        this.subscriber = redis.duplicate();
    }
    async publish(channel, payload) {
        await this.redis.publish(channel, JSON.stringify(payload));
    }
    async subscribe(channel, handler) {
        await this.subscriber.subscribe(channel);
        this.subscriber.on("message", (msgChannel, message) => {
            if (msgChannel !== channel)
                return;
            handler(JSON.parse(message));
        });
    }
}
exports.RedisPubSub = RedisPubSub;
exports.redisModuleOptionsToken = Symbol("REDIS_MODULE_OPTIONS");
let RedisModule = RedisModule_1 = class RedisModule {
    static forRoot(options) {
        return {
            module: RedisModule_1,
            providers: [
                {
                    provide: exports.redisModuleOptionsToken,
                    useValue: options ?? {},
                },
            ],
            exports: [exports.redisModuleOptionsToken],
        };
    }
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = RedisModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [config_1.ConfigModule.forRoot({ isGlobal: true })],
        providers: [
            {
                provide: exports.REDIS_CLIENT,
                inject: [config_1.ConfigService, exports.redisModuleOptionsToken],
                useFactory: (config, options) => {
                    const url = options?.url ?? config.get("REDIS_URL") ?? "redis://localhost:6379";
                    const client = new ioredis_1.Redis(url, {
                        keyPrefix: options?.keyPrefix ?? config.get("REDIS_KEY_PREFIX") ?? "ig:",
                    });
                    client.on("error", (err) => {
                        console.error("Redis connection error", err);
                    });
                    return client;
                },
            },
            {
                provide: exports.KEY_VALUE_STORE,
                inject: [exports.REDIS_CLIENT],
                useFactory: (redis) => new RedisKeyValueStore(redis),
            },
            {
                provide: exports.LOCK_MANAGER,
                inject: [exports.REDIS_CLIENT],
                useFactory: (redis) => new RedisLockManager(redis),
            },
            {
                provide: exports.PUB_SUB,
                inject: [exports.REDIS_CLIENT],
                useFactory: (redis) => new RedisPubSub(redis),
            },
        ],
        exports: [exports.REDIS_CLIENT, exports.KEY_VALUE_STORE, exports.LOCK_MANAGER, exports.PUB_SUB],
    })
], RedisModule);
