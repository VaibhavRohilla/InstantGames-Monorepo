import { Inject, Injectable } from "@nestjs/common";
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
import { HiloBetDto } from "./dto/hilo-bet.dto";
import { HiloBetResponse } from "./dto/hilo-response.dto";
import { GameName } from "@instant-games/core-types";
import {
  HiloChoice,
  HiloEvaluationMetadata,
  HiloMathConfig,
  HiloMathEngine,
} from "@instant-games/game-math-hilo";

const GAME: GameName = "hilo";
const DEFAULT_HOUSE_EDGE = 1;
const DEFAULT_MIN_RANK = 1;
const DEFAULT_MAX_RANK = 13;

@Injectable()
export class HiloService {
  private readonly engineCache = new Map<string, HiloMathEngine>();

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

  async placeBet(ctx: AuthContext, dto: HiloBetDto, idempotencyKey: string): Promise<HiloBetResponse> {
    const betAmount = BigInt(dto.betAmount);
    const betCtx: GameBetContext = { ...ctx, game: GAME };
    const config = await this.configService.getConfig({ ctx: betCtx, game: GAME });
    const mathConfig = this.buildMathConfig(config);
    const engine = this.getMathEngine(mathConfig);
    const choice = normalizeChoice(dto.choice);

    const result = await this.gameBetRunner.run({
      ctx: betCtx,
      request: {
        betAmount,
        payload: {
          currentRank: dto.currentRank,
          choice,
        },
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

    return this.toResponse(dto, choice, ctx.currency, result);
  }

  private getMathEngine(config: HiloMathConfig): HiloMathEngine {
    const key = JSON.stringify(config);
    const cached = this.engineCache.get(key);
    if (cached) {
      return cached;
    }
    const engine = new HiloMathEngine(config);
    this.engineCache.set(key, engine);
    return engine;
  }

  private buildMathConfig(config: GameConfig): HiloMathConfig {
    const extra = config.extra ?? {};
    const houseEdge = sanitizeHouseEdge(coerceNumber(extra["houseEdge"])) ?? DEFAULT_HOUSE_EDGE;
    const maxMultiplier = coerceNumber(extra["maxMultiplier"]);
    const minRank = coerceNumber(extra["minRank"]) ?? DEFAULT_MIN_RANK;
    const maxRank = coerceNumber(extra["maxRank"]) ?? DEFAULT_MAX_RANK;

    return {
      mathVersion: config.mathVersion ?? "1.0.0",
      houseEdge,
      minRank,
      maxRank,
      maxMultiplier: maxMultiplier && maxMultiplier > 0 ? maxMultiplier : undefined,
    };
  }

  private toResponse(
    dto: HiloBetDto,
    choice: HiloChoice,
    currency: string,
    result: GameBetRunnerResult,
  ): HiloBetResponse {
    const evaluation = (result.metadata?.evaluation ?? {}) as Partial<HiloEvaluationMetadata>;
    const drawnRank = evaluation.drawnRank ?? dto.currentRank;
    const isWin = evaluation.win ?? (result.result === "WIN");

    return {
      roundId: result.roundId,
      betAmount: dto.betAmount,
      payoutAmount: result.payout.toString(),
      currency,
      currentRank: dto.currentRank,
      drawnRank,
      choice,
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
}

function normalizeChoice(value: unknown): HiloChoice {
  if (typeof value !== "string") {
    throw new Error("Hilo: choice is required");
  }
  const normalized = value.trim().toUpperCase();
  if (normalized !== "HIGHER" && normalized !== "LOWER") {
    throw new Error("Hilo: choice must be HIGHER or LOWER");
  }
  return normalized as HiloChoice;
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

function sanitizeHouseEdge(value?: number): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  if (value < 0) {
    return 0;
  }
  if (value >= 100) {
    return 99.99;
  }
  return value;
}

