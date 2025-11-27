"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskService = exports.RiskViolationError = exports.RISK_SERVICE = void 0;
exports.RISK_SERVICE = Symbol("RISK_SERVICE");
class RiskViolationError extends Error {
    constructor(message) {
        super(message);
        this.name = "RiskViolationError";
    }
}
exports.RiskViolationError = RiskViolationError;
const RATE_LIMIT_KEY = (ctx, game) => `risk:rate-limit:${ctx.operatorId}:${game}:${ctx.currency}:${ctx.mode}`;
class RiskService {
    configService;
    store;
    constructor(configService, store) {
        this.configService = configService;
        this.store = store;
    }
    async validateBet(params) {
        const config = await this.configService.getConfig({ ctx: params.ctx, game: params.game });
        if (params.betAmount < config.minBet) {
            throw new RiskViolationError("BET_UNDER_MIN_LIMIT");
        }
        if (params.betAmount > config.maxBet) {
            throw new RiskViolationError("BET_OVER_MAX_LIMIT");
        }
        if (params.potentialPayout > config.maxPayoutPerRound) {
            throw new RiskViolationError("PAYOUT_OVER_LIMIT");
        }
        await this.enforceRateLimit(params.ctx, params.game, config);
    }
    async enforceRateLimit(ctx, game, config) {
        const key = RATE_LIMIT_KEY(ctx, game);
        const record = (await this.store.get(key)) ?? { count: 0, expiresAt: Date.now() + 60_000 };
        const windowMs = Number(config.extra?.betsPerWindowMs ?? 60_000);
        const limit = Number(config.extra?.betsPerWindow ?? 60);
        const now = Date.now();
        let nextRecord = record;
        if (now > record.expiresAt) {
            nextRecord = { count: 0, expiresAt: now + windowMs };
        }
        if (nextRecord.count >= limit) {
            throw new RiskViolationError("BET_RATE_LIMIT_EXCEEDED");
        }
        nextRecord = { ...nextRecord, count: nextRecord.count + 1 };
        const ttlSeconds = Math.ceil((nextRecord.expiresAt - now) / 1000);
        await this.store.set(key, nextRecord, ttlSeconds);
    }
}
exports.RiskService = RiskService;
