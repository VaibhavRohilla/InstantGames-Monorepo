"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisProvablyFairStateStore = exports.ProvablyFairService = exports.PROVABLY_FAIR_STATE_STORE = exports.PROVABLY_FAIR_SERVICE = void 0;
const crypto_1 = require("crypto");
exports.PROVABLY_FAIR_SERVICE = Symbol("PROVABLY_FAIR_SERVICE");
exports.PROVABLY_FAIR_STATE_STORE = Symbol("PROVABLY_FAIR_STATE_STORE");
class ProvablyFairService {
    async generateServerSeed() {
        return (0, crypto_1.randomBytes)(32).toString("hex");
    }
    hashServerSeed(serverSeed) {
        return (0, crypto_1.createHash)("sha256").update(serverSeed).digest("hex");
    }
    async initContext(params) {
        const serverSeed = await this.generateServerSeed();
        const serverSeedHash = this.hashServerSeed(serverSeed);
        return {
            userId: params.userId,
            game: params.game,
            serverSeed,
            serverSeedHash,
            clientSeed: params.clientSeed ?? (0, crypto_1.randomBytes)(16).toString("hex"),
            nonce: 0,
        };
    }
    rollFloat(ctx, nonce) {
        const payload = `${ctx.clientSeed}:${nonce}`;
        const digest = (0, crypto_1.createHmac)("sha256", ctx.serverSeed).update(payload).digest("hex");
        const slice = digest.slice(0, 13);
        const decimal = parseInt(slice, 16);
        const max = Math.pow(16, slice.length);
        return decimal / max;
    }
    rollInt(ctx, nonce, min, max) {
        if (max <= min)
            throw new Error("Invalid rollInt bounds");
        const span = max - min + 1;
        const float = this.rollFloat(ctx, nonce);
        return min + Math.floor(float * span);
    }
    verifyRoll(params) {
        const ctx = {
            game: "dice", // placeholder, not used in deterministic roll
            userId: "verify",
            serverSeed: params.serverSeed,
            serverSeedHash: this.hashServerSeed(params.serverSeed),
            clientSeed: params.clientSeed,
            nonce: params.nonce,
        };
        const actual = this.rollInt(ctx, params.nonce, params.min, params.max);
        return actual === params.expected;
    }
}
exports.ProvablyFairService = ProvablyFairService;
const CONTEXT_KEY = (userId, game) => `pf:ctx:${game}:${userId}`;
const NONCE_KEY = (userId, game) => `pf:nonce:${game}:${userId}`;
class RedisProvablyFairStateStore {
    kv;
    pfService;
    ttlSeconds;
    constructor(kv, pfService, ttlSeconds = 60 * 60 * 24) {
        this.kv = kv;
        this.pfService = pfService;
        this.ttlSeconds = ttlSeconds;
    }
    async getOrInitContext(userId, game, clientSeed) {
        const key = CONTEXT_KEY(userId, game);
        const existing = await this.kv.get(key);
        if (existing) {
            if (clientSeed && existing.clientSeed !== clientSeed) {
                existing.clientSeed = clientSeed;
                existing.nonce = 0;
                await this.kv.set(key, existing, this.ttlSeconds);
            }
            return existing;
        }
        const ctx = await this.pfService.initContext({ userId, game, clientSeed });
        await this.kv.set(key, ctx, this.ttlSeconds);
        await this.kv.set(NONCE_KEY(userId, game), { nonce: 0 }, this.ttlSeconds);
        return ctx;
    }
    async nextNonce(userId, game) {
        const key = NONCE_KEY(userId, game);
        const record = (await this.kv.get(key)) ?? { nonce: 0 };
        const next = record.nonce + 1;
        await this.kv.set(key, { nonce: next }, this.ttlSeconds);
        return next;
    }
    async revealServerSeed(userId, game) {
        const ctx = await this.kv.get(CONTEXT_KEY(userId, game));
        return ctx?.serverSeed ?? null;
    }
}
exports.RedisProvablyFairStateStore = RedisProvablyFairStateStore;
