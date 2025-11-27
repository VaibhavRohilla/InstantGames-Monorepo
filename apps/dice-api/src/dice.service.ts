import { Inject, Injectable } from "@nestjs/common";
import { AuthContext } from "@instant-games/core-auth";
import { GAME_CONFIG_SERVICE, IGameConfigService } from "@instant-games/core-config";
import { DiceMathEngine, DiceMathConfig } from "@instant-games/game-math-dice";
import { DiceBetDto } from "./dto/dice-bet.dto";
import { DiceBetResponse } from "./dto/dice-response.dto";
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
import { GameName } from "@instant-games/core-types";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { GameBetContext, GameBetRunner, GameBetRunnerResult } from "@instant-games/core-game-slice";

const GAME: GameName = "dice";

@Injectable()
export class DiceService {
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

  async placeBet(ctx: AuthContext, dto: DiceBetDto, idempotencyKey: string): Promise<DiceBetResponse> {
    const betAmount = BigInt(dto.betAmount);
    const config = await this.configService.getConfig({ ctx, game: GAME });
    const mathConfig = this.buildMathConfig(config.extra ?? {}, config.mathVersion);
    const engine = new DiceMathEngine(mathConfig);
    const betCtx: GameBetContext = { ...ctx, game: GAME };

    const result = await this.gameBetRunner.run({
      ctx: betCtx,
      request: {
        betAmount,
        payload: { target: dto.target, condition: dto.condition },
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
      preloadedConfig: config,
    });

    return this.toResponse(dto, result);
  }

  private buildMathConfig(extra: Record<string, unknown>, mathVersion: string): DiceMathConfig {
    const mathExtra = extra as Partial<Record<string, number>>;
    return {
      mathVersion,
      houseEdge: typeof mathExtra.houseEdge === "number" ? mathExtra.houseEdge : 1,
      minTarget: typeof mathExtra.minTarget === "number" ? mathExtra.minTarget : 2,
      maxTarget: typeof mathExtra.maxTarget === "number" ? mathExtra.maxTarget : 98,
      maxMultiplier: typeof mathExtra.maxMultiplier === "number" ? mathExtra.maxMultiplier : undefined,
    };
  }

  private toResponse(dto: DiceBetDto, result: GameBetRunnerResult): DiceBetResponse {
    const evaluation = (result.metadata?.evaluation ?? {}) as Record<string, unknown>;
    const rolled = typeof evaluation["rolled"] === "number" ? (evaluation["rolled"] as number) : 0;
    return {
      roundId: result.roundId,
      betAmount: dto.betAmount,
      payoutAmount: result.payout.toString(),
      rolled,
      target: dto.target,
      condition: dto.condition,
      serverSeedHash: result.pf.serverSeedHash,
      clientSeed: result.pf.clientSeed,
      nonce: result.pf.nonce,
      createdAt: result.createdAt,
      mathVersion: result.mathVersion,
    };
  }
}
