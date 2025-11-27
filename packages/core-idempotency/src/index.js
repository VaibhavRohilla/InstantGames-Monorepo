"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisIdempotencyStore = exports.IDEMPOTENCY_STORE = void 0;
exports.IDEMPOTENCY_STORE = Symbol("IDEMPOTENCY_STORE");
class RedisIdempotencyStore {
    store;
    constructor(store) {
        this.store = store;
    }
    async performOrGetCached(key, ttlSeconds, fn) {
        const cached = await this.store.get(`idem:${key}`);
        if (cached) {
            return cached.payload;
        }
        const result = await fn();
        await this.store.set(`idem:${key}`, { payload: result }, ttlSeconds);
        return result;
    }
}
exports.RedisIdempotencyStore = RedisIdempotencyStore;
