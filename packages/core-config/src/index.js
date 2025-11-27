"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DbGameConfigService = exports.GAME_CONFIG_SERVICE = void 0;
exports.GAME_CONFIG_SERVICE = Symbol("GAME_CONFIG_SERVICE");
const CACHE_KEY = (ctx, game) => `config:${ctx.operatorId}:${game}:${ctx.currency}:${ctx.mode}`;
class DbGameConfigService {
    db;
    cache;
    ttlSeconds;
    constructor(db, cache, ttlSeconds = 60) {
        this.db = db;
        this.cache = cache;
        this.ttlSeconds = ttlSeconds;
    }
    async getConfig(params) {
        const key = CACHE_KEY(params.ctx, params.game);
        const cached = await this.cache.get(key);
        if (cached)
            return cached;
        const rows = await this.db.query(`SELECT * FROM game_configs WHERE operator_id = $1 AND game = $2 AND currency = $3 AND mode = $4 LIMIT 1`, [params.ctx.operatorId, params.game, params.ctx.currency, params.ctx.mode]);
        if (!rows.length) {
            throw new Error(`Config not found for ${params.game} / ${params.ctx.operatorId}`);
        }
        const row = rows[0];
        const config = {
            game: row.game,
            operatorId: row.operator_id,
            currency: row.currency,
            mode: row.mode,
            minBet: BigInt(row.min_bet),
            maxBet: BigInt(row.max_bet),
            maxPayoutPerRound: BigInt(row.max_payout_per_round),
            volatilityProfile: row.volatility_profile ?? undefined,
            mathVersion: row.math_version,
            demoEnabled: row.demo_enabled,
            realEnabled: row.real_enabled,
            features: row.features ?? {},
            extra: row.extra ?? {},
        };
        await this.cache.set(key, config, this.ttlSeconds);
        return config;
    }
}
exports.DbGameConfigService = DbGameConfigService;
