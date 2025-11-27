import { AuthContext } from "@instant-games/core-auth";
import { GameName } from "@instant-games/core-types";
import { IGameConfigService } from "@instant-games/core-config";
import { IKeyValueStore } from "@instant-games/core-redis";

export interface IRiskService {
  validateBet(params: { ctx: AuthContext; game: GameName; betAmount: bigint; potentialPayout: bigint }): Promise<void>;
}

export const RISK_SERVICE = Symbol("RISK_SERVICE");

export class RiskViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskViolationError";
  }
}

const RATE_LIMIT_KEY = (ctx: AuthContext, game: GameName) =>
  `risk:rate-limit:${ctx.operatorId}:${game}:${ctx.currency}:${ctx.mode}`;

export class RiskService implements IRiskService {
  constructor(private readonly configService: IGameConfigService, private readonly store: IKeyValueStore) {}

  async validateBet(params: { ctx: AuthContext; game: GameName; betAmount: bigint; potentialPayout: bigint }): Promise<void> {
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

  private async enforceRateLimit(ctx: AuthContext, game: GameName, config: Awaited<ReturnType<IGameConfigService["getConfig"]>>) {
    const key = RATE_LIMIT_KEY(ctx, game);
    const windowMs = Number(config.extra?.betsPerWindowMs ?? 60_000);
    const limit = Number(config.extra?.betsPerWindow ?? 60);
    const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

    const count = await this.store.incr(key, ttlSeconds);
    if (count > limit) {
      throw new RiskViolationError("BET_RATE_LIMIT_EXCEEDED");
    }
  }
}
