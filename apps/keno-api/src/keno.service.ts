import { Inject, Injectable } from "@nestjs/common";
import { AuthContext } from "@instant-games/core-auth";
import { GAME_CONFIG_SERVICE, IGameConfigService } from "@instant-games/core-config";
import { IRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { IProvablyFairStateStore, PROVABLY_FAIR_STATE_STORE } from "@instant-games/core-provably-fair";
import { WALLET_ROUTER, WalletRouter } from "@instant-games/core-wallet";
import { GameRoundRepository } from "@instant-games/core-game-history";
import { WalletTransactionRepository } from "@instant-games/core-ledger";
import { IDEMPOTENCY_STORE, IIdempotencyStore } from "@instant-games/core-idempotency";
import { ILogger, LOGGER } from "@instant-games/core-logging";
import { IMetrics, METRICS } from "@instant-games/core-metrics";
import { IRiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { IBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { GameBetContext, GameBetRunner, GameBetRunnerResult } from "@instant-games/core-game-slice";
import { KenoBetDto } from "./dto/keno-bet.dto";
import { KenoBetResponse } from "./dto/keno-response.dto";
import { GameName } from "@instant-games/core-types";
import { KenoMathEngine } from "@instant-games/game-math-keno";

const GAME: GameName = "keno";

@Injectable()
export class KenoService {
  private readonly engine = new KenoMathEngine();

  constructor(
    @Inject(GAME_CONFIG_SERVICE) private readonly configService: IGameConfigService,
    @Inject(RNG_SERVICE) private readonly rng: IRngService,
    @Inject(PROVABLY_FAIR_STATE_STORE) private readonly provablyFairStore: IProvablyFairStateStore,
    @Inject(WALLET_ROUTER) private readonly walletRouter: WalletRouter,
    @Inject(IDEMPOTENCY_STORE) private readonly idempotencyStore: IIdempotencyStore,
    @Inject(LOGGER) private readonly logger: ILogger,
    @Inject(METRICS) private readonly metrics: IMetrics,
    @Inject(RISK_SERVICE) private readonly riskService: IRiskService,
    @Inject(BONUS_PORT) private readonly bonusPort: IBonusPort,
    @Inject(DB_CLIENT) private readonly db: IDbClient,
    @Inject(GameBetRunner) private readonly gameBetRunner: GameBetRunner,
  ) {}

  async placeBet(ctx: AuthContext, dto: KenoBetDto, idempotencyKey: string): Promise<KenoBetResponse> {
    const betAmount = BigInt(dto.betAmount);
    const betCtx: GameBetContext = { ...ctx, game: GAME };
    const result = await this.gameBetRunner.run({
      ctx: betCtx,
      request: {
        betAmount,
        payload: { picks: dto.picks },
        clientSeed: dto.clientSeed,
      },
      idempotencyKey,
      mathEngine: this.engine,
      configService: this.configService,
      riskService: this.riskService,
      provablyFairStore: this.provablyFairStore,
      rngService: this.rng,
      walletRouter: this.walletRouter,
      roundRepoFactory: (tx) => new GameRoundRepository(tx),
      ledgerRepoFactory: (tx) => new WalletTransactionRepository(tx),
      bonusService: this.bonusPort,
      idempotencyStore: this.idempotencyStore,
      logger: this.logger,
      metrics: this.metrics,
      db: this.db,
    });

    return this.toResponse(dto, ctx.currency, result);
  }

  private toResponse(dto: KenoBetDto, currency: string, result: GameBetRunnerResult): KenoBetResponse {
    return {
      roundId: result.roundId,
      betAmount: dto.betAmount,
      payout: result.payout.toString(),
      currency,
      result: result.result,
      metadata: result.metadata ?? {},
      createdAt: result.createdAt,
    };
  }
}

