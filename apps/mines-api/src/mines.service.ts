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
import { MinesBetDto } from "./dto/mines-bet.dto";
import { MinesBetResponse } from "./dto/mines-response.dto";
import { GameName } from "@instant-games/core-types";
import { MinesMathEngine } from "@instant-games/game-math-mines";

const GAME: GameName = "mines";

@Injectable()
export class MinesService {
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

  async placeBet(ctx: AuthContext, dto: MinesBetDto, idempotencyKey: string): Promise<MinesBetResponse> {
    const betAmount = BigInt(dto.betAmount);
    const betCtx: GameBetContext = { ...ctx, game: GAME };
    const engine = new MinesMathEngine();

    const result = await this.gameBetRunner.run({
      ctx: betCtx,
      request: {
        betAmount,
        payload: { cell: dto.cell },
        clientSeed: dto.clientSeed,
      },
      idempotencyKey,
      mathEngine: engine,
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

  private toResponse(dto: MinesBetDto, currency: string, result: GameBetRunnerResult): MinesBetResponse {
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

