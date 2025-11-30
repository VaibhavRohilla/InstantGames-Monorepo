import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AuthContext } from "@instant-games/core-auth";
import { GAME_CONFIG_SERVICE, GameConfig, IGameConfigService } from "@instant-games/core-config";
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
import { CoinflipBetDto } from "./dto/coinflip-bet.dto";
import { CoinflipBetResponse } from "./dto/coinflip-response.dto";
import { GameName } from "@instant-games/core-types";
import {
  CoinFlipEvaluationMetadata,
  CoinFlipMathConfig,
  CoinFlipMathEngine,
  CoinFlipSide,
} from "@instant-games/game-math-coinflip";

const GAME: GameName = "coinflip";
const DEFAULT_HOUSE_EDGE = 1;

@Injectable()
export class CoinflipService {
  private readonly engineCache = new Map<string, CoinFlipMathEngine>();

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

  async placeBet(ctx: AuthContext, dto: CoinflipBetDto, idempotencyKey: string): Promise<CoinflipBetResponse> {
    const betAmount = BigInt(dto.betAmount);
    const betCtx: GameBetContext = { ...ctx, game: GAME };
    const config = await this.configService.getConfig({ ctx: betCtx, game: GAME });
    const mathConfig = this.buildMathConfig(config);
    const engine = this.getMathEngine(mathConfig);
    const pickedSide = normalizeSide(dto.side);

    const result = await this.gameBetRunner.run({
      ctx: betCtx,
      request: {
        betAmount,
        payload: { side: pickedSide },
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

    this.recordMetrics(betCtx, result);
    this.logRound(betCtx, pickedSide, result);

    return this.toResponse(dto.betAmount, pickedSide, ctx.currency, result);
  }

  private getMathEngine(config: CoinFlipMathConfig): CoinFlipMathEngine {
    const cacheKey = JSON.stringify(config);
    const cached = this.engineCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const engine = new CoinFlipMathEngine(config);
    this.engineCache.set(cacheKey, engine);
    return engine;
  }

  private buildMathConfig(config: GameConfig): CoinFlipMathConfig {
    const extra = config.extra ?? {};
    const houseEdge = sanitizeHouseEdge(coerceNumber(extra["houseEdge"])) ?? DEFAULT_HOUSE_EDGE;
    const maxMultiplier = coerceNumber(extra["maxMultiplier"]);
    return {
      mathVersion: config.mathVersion,
      houseEdge,
      maxMultiplier: maxMultiplier && maxMultiplier > 0 ? maxMultiplier : undefined,
    };
  }

  private toResponse(
    betAmount: string,
    pickedSide: CoinFlipSide,
    currency: string,
    result: GameBetRunnerResult,
  ): CoinflipBetResponse {
    const evaluation = this.getEvaluationMetadata(result);
    const outcome = evaluation.outcome ?? pickedSide;
    const isWin = evaluation.win ?? (result.result === "WIN");

    return {
      roundId: result.roundId,
      betAmount,
      payoutAmount: result.payout.toString(),
      currency,
      pickedSide,
      outcome,
      isWin,
      winAmount: isWin ? Number(result.payout) : 0,
      payoutMultiplier: evaluation.multiplier ?? 0,
      serverSeedHash: result.pf.serverSeedHash,
      clientSeed: result.pf.clientSeed,
      nonce: result.pf.nonce,
      mathVersion: result.mathVersion,
      createdAt: result.createdAt,
    };
  }

  private recordMetrics(ctx: GameBetContext, result: GameBetRunnerResult): void {
    const labels = this.metricLabels(ctx);
    this.metrics.increment("coinflip_bets_total", { ...labels, outcome: result.result.toLowerCase() });
    if (result.result === "WIN") {
      this.metrics.increment("coinflip_wins_total", labels);
    } else {
      this.metrics.increment("coinflip_losses_total", labels);
    }

    const betAmountNumber = Number(result.betAmount);
    if (betAmountNumber > 0 && Number.isFinite(betAmountNumber)) {
      this.metrics.observe("coinflip_bet_amount", betAmountNumber, labels);
      const ratio = Number(result.payout) / betAmountNumber;
      this.metrics.observe("coinflip_payout_ratio", Number.isFinite(ratio) ? ratio : 0, labels);
    }
  }

  private logRound(ctx: GameBetContext, pickedSide: CoinFlipSide, result: GameBetRunnerResult): void {
    const evaluation = this.getEvaluationMetadata(result);
    const outcome = evaluation.outcome ?? pickedSide;
    const isWin = evaluation.win ?? (result.result === "WIN");

    this.logger.info("coinflip.bet.settled", {
      operatorId: ctx.operatorId,
      userId: ctx.userId,
      game: ctx.game,
      roundId: result.roundId,
      betAmount: result.betAmount.toString(),
      payoutAmount: result.payout.toString(),
      pickedSide,
      outcome,
      win: isWin,
      multiplier: evaluation.multiplier ?? 0,
      serverSeedHash: result.pf.serverSeedHash,
      clientSeed: result.pf.clientSeed,
      nonce: result.pf.nonce,
      mathVersion: result.mathVersion,
      mode: ctx.mode,
      currency: ctx.currency,
    });
  }

  private metricLabels(ctx: GameBetContext): Record<string, string> {
    return {
      game: ctx.game,
      operatorId: ctx.operatorId,
      mode: ctx.mode,
      currency: ctx.currency,
    };
  }

  private getEvaluationMetadata(result: GameBetRunnerResult): Partial<CoinFlipEvaluationMetadata> {
    return (result.metadata?.evaluation ?? {}) as Partial<CoinFlipEvaluationMetadata>;
  }
}

function normalizeSide(value: unknown): CoinFlipSide {
  if (typeof value !== "string") {
    throw new BadRequestException("CoinFlip: side is required");
  }
  const normalized = value.trim().toUpperCase();
  if (normalized !== "HEADS" && normalized !== "TAILS") {
    throw new BadRequestException("CoinFlip: side must be HEADS or TAILS");
  }
  return normalized as CoinFlipSide;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function sanitizeHouseEdge(value: number | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (value < 0 || value >= 100) {
    throw new Error("CoinFlip: houseEdge must be between 0 (inclusive) and 100 (exclusive)");
  }
  return value;
}

