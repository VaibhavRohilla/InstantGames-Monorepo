import { AuthContext } from "@instant-games/core-auth";
import { GameMode, GameName } from "@instant-games/core-types";
import { IDbClient } from "@instant-games/core-db";
import { IKeyValueStore } from "@instant-games/core-redis";

export interface GameConfig {
  game: GameName;
  operatorId: string;
  currency: string;
  mode: GameMode;
  minBet: bigint;
  maxBet: bigint;
  maxPayoutPerRound: bigint;
  volatilityProfile?: "low" | "medium" | "high";
  mathVersion: string;
  demoEnabled: boolean;
  realEnabled: boolean;
  features: Record<string, boolean>;
  extra: Record<string, unknown>;
}

export interface IGameConfigService {
  getConfig(params: { ctx: AuthContext; game: GameName }): Promise<GameConfig>;
}

export const GAME_CONFIG_SERVICE = Symbol("GAME_CONFIG_SERVICE");

const CACHE_KEY = (ctx: AuthContext, game: GameName) => `config:${ctx.operatorId}:${game}:${ctx.currency}:${ctx.mode}`;

export class DbGameConfigService implements IGameConfigService {
  constructor(private readonly db: IDbClient, private readonly cache: IKeyValueStore, private readonly ttlSeconds = 60) {}

  async getConfig(params: { ctx: AuthContext; game: GameName }): Promise<GameConfig> {
    const key = CACHE_KEY(params.ctx, params.game);
    const cached = await this.cache.get<GameConfig>(key);
    if (cached) return cached;

    const rows = await this.db.query<ConfigRow>(
      `SELECT * FROM game_configs WHERE operator_id = $1 AND game = $2 AND currency = $3 AND mode = $4 LIMIT 1`,
      [params.ctx.operatorId, params.game, params.ctx.currency, params.ctx.mode]
    );

    if (!rows.length) {
      throw new Error(`Config not found for ${params.game} / ${params.ctx.operatorId}`);
    }

    const row = rows[0];
    const config: GameConfig = {
      game: row.game,
      operatorId: row.operator_id,
      currency: row.currency,
      mode: row.mode,
      minBet: BigInt(row.min_bet),
      maxBet: BigInt(row.max_bet),
      maxPayoutPerRound: BigInt(row.max_payout_per_round),
      volatilityProfile: (row.volatility_profile as GameConfig["volatilityProfile"]) ?? undefined,
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

interface ConfigRow {
  operator_id: string;
  game: GameName;
  currency: string;
  mode: GameMode;
  min_bet: string;
  max_bet: string;
  max_payout_per_round: string;
  volatility_profile: string | null;
  math_version: string;
  demo_enabled: boolean;
  real_enabled: boolean;
  features: Record<string, boolean>;
  extra: Record<string, unknown>;
}
