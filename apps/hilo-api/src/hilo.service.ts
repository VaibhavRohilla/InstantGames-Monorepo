import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { AuthContext } from "@instant-games/core-auth";
import { IProvablyFairStateStore, PROVABLY_FAIR_STATE_STORE } from "@instant-games/core-provably-fair";
import { IRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { WALLET_ROUTER, WalletRouter, scopeWalletUserId } from "@instant-games/core-wallet";
import { IKeyValueStore, ILockManager, KEY_VALUE_STORE, LOCK_MANAGER } from "@instant-games/core-redis";
import { IDEMPOTENCY_STORE, IIdempotencyStore } from "@instant-games/core-idempotency";
import { ILogger, LOGGER } from "@instant-games/core-logging";
import { IMetrics, METRICS } from "@instant-games/core-metrics";
import { IRiskService, RISK_SERVICE, RiskViolationError } from "@instant-games/core-risk";
import { IBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { GameRoundRepository } from "@instant-games/core-game-history";
import { WalletTransactionRepository } from "@instant-games/core-ledger";
import { GameName } from "@instant-games/core-types";
import { HiloStartDto } from "./dto/hilo-bet.dto";
import { HiloGuessDto } from "./dto/hilo-guess.dto";
import { HiloCashoutResponse, HiloGuessResponse, HiloStartResponse } from "./dto/hilo-response.dto";
import {
  GuessDirection,
  applyGuess as applyHiloGuess,
  markCashout as markHiloCashout,
  startRound as startHiloRound,
} from "@instant-games/game-math-hilo";
import { HiloConfigService } from "./hilo.config";
import { buildHiloDeck } from "./hilo.deck";
import { HiloPersistedRoundRecord, HiloResolvedConfig, HiloRoundView } from "./hilo.types";

const GAME: GameName = "hilo";
const ROUND_TTL_SECONDS = 60 * 60 * 2;
const USER_LOCK_TTL_MS = 5_000;
const IDEMPOTENCY_TTL_SECONDS = 60;
const MULTIPLIER_SCALE = 10_000n;

@Injectable()
export class HiloService {
  constructor(
    private readonly hiloConfig: HiloConfigService,
    @Inject(PROVABLY_FAIR_STATE_STORE) private readonly provablyFairStore: IProvablyFairStateStore,
    @Inject(RNG_SERVICE) private readonly rngService: IRngService,
    @Inject(WALLET_ROUTER) private readonly walletRouter: WalletRouter,
    @Inject(KEY_VALUE_STORE) private readonly kvStore: IKeyValueStore,
    @Inject(LOCK_MANAGER) private readonly lockManager: ILockManager,
    @Inject(IDEMPOTENCY_STORE) private readonly idempotencyStore: IIdempotencyStore,
    @Inject(RISK_SERVICE) private readonly riskService: IRiskService,
    @Inject(BONUS_PORT) private readonly bonusPort: IBonusPort,
    @Inject(DB_CLIENT) private readonly db: IDbClient,
    @Inject(LOGGER) private readonly logger: ILogger,
    @Inject(METRICS) private readonly metrics: IMetrics,
  ) {}

  async startRound(ctx: AuthContext, dto: HiloStartDto, idempotencyKey: string): Promise<HiloStartResponse> {
    return this.idempotencyStore.performOrGetCached(
      this.idemCacheKey("start", ctx, idempotencyKey),
      IDEMPOTENCY_TTL_SECONDS,
      async () =>
        this.lockManager.withLock(this.userLockKey(ctx), USER_LOCK_TTL_MS, async () => this.doStartRound(ctx, dto)),
    );
  }

  async guess(ctx: AuthContext, dto: HiloGuessDto, idempotencyKey: string): Promise<HiloGuessResponse> {
    return this.idempotencyStore.performOrGetCached(
      this.idemCacheKey("guess", ctx, idempotencyKey),
      IDEMPOTENCY_TTL_SECONDS,
      async () =>
        this.lockManager.withLock(this.userLockKey(ctx), USER_LOCK_TTL_MS, async () => this.doGuess(ctx, dto)),
    );
  }

  async cashout(ctx: AuthContext, idempotencyKey: string): Promise<HiloCashoutResponse> {
    return this.idempotencyStore.performOrGetCached(
      this.idemCacheKey("cashout", ctx, idempotencyKey),
      IDEMPOTENCY_TTL_SECONDS,
      async () =>
        this.lockManager.withLock(this.userLockKey(ctx), USER_LOCK_TTL_MS, async () => this.doCashout(ctx)),
    );
  }

  async getActiveRound(ctx: AuthContext): Promise<HiloRoundView | null> {
    const record = await this.getRoundRecord(ctx);
    if (!record) {
      return null;
    }
    return this.toRoundView(record);
  }

  private async doStartRound(ctx: AuthContext, dto: HiloStartDto): Promise<HiloStartResponse> {
    const betAmount = this.parseBetAmount(dto.betAmount);
    const { base: baseConfig, runtime } = await this.hiloConfig.getConfig(ctx);
    this.ensureModeEnabled(ctx, baseConfig);
    this.assertBetLimits(betAmount, runtime);

    const existing = await this.getRoundRecord(ctx);
    if (existing && existing.status === "active") {
      throw new ConflictException("An active Hi-Lo round already exists");
    }

    const potentialPayout = this.computeMaxPayout(betAmount, runtime.multipliers[runtime.maxSteps - 1]);
    await this.validateRisk(ctx, betAmount, potentialPayout);

    const wallet = this.walletRouter.resolve(ctx.mode);
    const scopedUserId = scopeWalletUserId(ctx.operatorId, ctx.userId);
    const balanceBefore = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);
    try {
      await wallet.debitIfSufficient(scopedUserId, betAmount, ctx.currency, ctx.mode, { game: GAME });
    } catch {
      throw new BadRequestException("Insufficient balance");
    }
    const balanceAfterBet = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);

    const pfContext = await this.provablyFairStore.getOrInitContext({
      operatorId: ctx.operatorId,
      mode: ctx.mode,
      userId: ctx.userId,
      game: GAME,
      clientSeed: dto.clientSeed,
    });
    const nonce = await this.provablyFairStore.nextNonce({
      operatorId: ctx.operatorId,
      mode: ctx.mode,
      userId: ctx.userId,
      game: GAME,
    });
    const { deck } = buildHiloDeck({ rngService: this.rngService, context: pfContext, baseNonce: nonce });
    const engineState = startHiloRound(deck, this.toEngineAmount(betAmount), runtime);

    const record: HiloPersistedRoundRecord = {
      roundId: "",
      operatorId: ctx.operatorId,
      userId: ctx.userId,
      currency: ctx.currency,
      mode: ctx.mode,
      config: runtime,
      state: engineState,
      status: "active",
      baseBet: betAmount,
      serverSeedHash: pfContext.serverSeedHash,
      serverSeedId: pfContext.serverSeedId,
      clientSeed: pfContext.clientSeed,
      nonce,
      mathVersion: runtime.mathVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await this.db.transaction(async (tx) => {
        const roundRepo = new GameRoundRepository(tx);
        const round = await roundRepo.createPending({
          game: GAME,
          userId: ctx.userId,
          operatorId: ctx.operatorId,
          mode: ctx.mode,
          currency: ctx.currency,
          betAmount,
          mathVersion: runtime.mathVersion,
          serverSeedHash: pfContext.serverSeedHash,
          serverSeed: pfContext.serverSeed,
          clientSeed: pfContext.clientSeed,
          nonce,
          meta: { pfSeedId: pfContext.serverSeedId, mathVersion: runtime.mathVersion },
        });
        record.roundId = round.id;

        const ledgerRepo = new WalletTransactionRepository(tx);
        await ledgerRepo.log({
          id: randomUUID(),
          userId: ctx.userId,
          operatorId: ctx.operatorId,
          mode: ctx.mode,
          currency: ctx.currency,
          amount: betAmount * BigInt(-1),
          balanceBefore,
          balanceAfter: balanceAfterBet,
          type: "BET",
          game: GAME,
          roundId: round.id,
          createdAt: new Date(),
          meta: { reason: "hilo_start" },
        });
      });
    } catch (err) {
      await wallet.credit(scopedUserId, betAmount, ctx.currency, ctx.mode, { reason: "hilo_refund" });
      throw err;
    }

    await this.saveRoundRecord(ctx, record);
    this.metrics.increment("hilo_rounds_started_total", this.metricTags(ctx, { status: "success" }));
    this.logger.info("hilo.round.started", this.logRound(ctx, record, { betAmount: betAmount.toString() }));

    return this.toRoundView(record);
  }

  private async doGuess(ctx: AuthContext, dto: HiloGuessDto): Promise<HiloGuessResponse> {
    const record = await this.getRoundRecord(ctx);
    if (!record) {
      throw new BadRequestException("No active Hi-Lo round");
    }
    if (record.status !== "active") {
      throw new BadRequestException("Round is no longer active");
    }
    if (record.state.finished) {
      throw new BadRequestException("Round already finished");
    }

    const direction = normalizeDirection(dto.direction);
    const outcome = applyHiloGuess(record.state, direction, record.config);
    record.state = outcome.state;
    record.updatedAt = new Date().toISOString();
    if (outcome.state.finished && outcome.result === "lose") {
      record.status = "lost";
    }

    await this.saveRoundRecord(ctx, record);
    if (record.status === "lost") {
      await this.settleRound(ctx, record, 0n, { reason: "lose" });
    }

    this.metrics.increment("hilo_guesses_total", this.metricTags(ctx, { result: outcome.result }));
    if (record.status === "lost") {
      this.metrics.increment("hilo_busts_total", this.metricTags(ctx));
      this.observeChainLength(ctx, record);
    } else if (record.state.finished && record.state.step >= record.config.maxSteps) {
      this.metrics.increment("hilo_max_chain_reached_total", this.metricTags(ctx));
    }

    this.logger.info("hilo.round.guess", this.logRound(ctx, record, { result: outcome.result }));

    return {
      ...this.toRoundView(record),
      nextCard: outcome.nextCard,
      result: outcome.result,
      sameRankDifferentSuit: outcome.sameRankDifferentSuit,
    };
  }

  private async doCashout(ctx: AuthContext): Promise<HiloCashoutResponse> {
    const record = await this.getRoundRecord(ctx);
    if (!record || record.status !== "active") {
      throw new BadRequestException("No active Hi-Lo round");
    }
    if (record.state.step === 0) {
      throw new BadRequestException("No winnings to cash out");
    }

    const wallet = this.walletRouter.resolve(ctx.mode);
    const scopedUserId = scopeWalletUserId(ctx.operatorId, ctx.userId);
    const winAmount = this.computeWinAmount(record.baseBet, record.state.totalMultiplier);
    if (winAmount <= 0n) {
      throw new BadRequestException("No winnings to cash out");
    }

    await wallet.credit(scopedUserId, winAmount, ctx.currency, ctx.mode, { reason: "hilo_cashout" });
    const balanceAfter = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);

    record.state = markHiloCashout(record.state);
    record.status = "cashed_out";
    record.updatedAt = new Date().toISOString();

    await this.db.transaction(async (tx) => {
      const roundRepo = new GameRoundRepository(tx);
      await roundRepo.markSettled(record.roundId, winAmount, {
        evaluation: { step: record.state.step, multiplier: record.state.totalMultiplier },
      });
      const ledgerRepo = new WalletTransactionRepository(tx);
      await ledgerRepo.log({
        id: randomUUID(),
        userId: ctx.userId,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        currency: ctx.currency,
        amount: winAmount,
        balanceBefore: balanceAfter - winAmount,
        balanceAfter,
        type: "PAYOUT",
        game: GAME,
        roundId: record.roundId,
        createdAt: new Date(),
        meta: { reason: "hilo_cashout" },
      });
    });

    await this.bonusPort.onRoundSettled({
      ctx,
      game: GAME,
      roundId: record.roundId,
      betAmount: record.baseBet,
      payoutAmount: winAmount,
      mode: ctx.mode,
    });

    await this.saveRoundRecord(ctx, record);
    this.metrics.increment("hilo_cashouts_total", this.metricTags(ctx));
    this.observeChainLength(ctx, record);
    this.logger.info("hilo.round.cashed_out", this.logRound(ctx, record, { winAmount: winAmount.toString() }));

    return {
      ...this.toRoundView(record),
      winAmount: winAmount.toString(),
    };
  }

  private async settleRound(
    ctx: AuthContext,
    record: HiloPersistedRoundRecord,
    payout: bigint,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const roundRepo = new GameRoundRepository(tx);
      await roundRepo.markSettled(record.roundId, payout, { evaluation: meta });
    });
    await this.bonusPort.onRoundSettled({
      ctx,
      game: GAME,
      roundId: record.roundId,
      betAmount: record.baseBet,
      payoutAmount: payout,
      mode: ctx.mode,
    });
  }

  private async validateRisk(ctx: AuthContext, betAmount: bigint, potentialPayout: bigint): Promise<void> {
    try {
      await this.riskService.validateBet({ ctx: { ...ctx }, game: GAME, betAmount, potentialPayout });
    } catch (err) {
      if (err instanceof RiskViolationError) {
        throw new BadRequestException({ code: "LIMIT_VIOLATION", message: err.message });
      }
      throw err;
    }
  }

  private ensureModeEnabled(ctx: AuthContext, config: HiloResolvedConfig["base"]): void {
    if (ctx.mode === "demo" && !config.demoEnabled) {
      throw new ForbiddenException("Demo mode is disabled for this game");
    }
    if (ctx.mode === "real" && !config.realEnabled) {
      throw new ForbiddenException("Real-money mode is disabled for this game");
    }
  }

  private assertBetLimits(amount: bigint, config: HiloResolvedConfig["runtime"]): void {
    if (amount < config.minBet) {
      throw new BadRequestException("Bet is below the minimum limit");
    }
    if (amount > config.maxBet) {
      throw new BadRequestException("Bet exceeds the maximum limit");
    }
  }

  private computeMaxPayout(betAmount: bigint, multiplier: number): bigint {
    const scaled = BigInt(Math.round(multiplier * Number(MULTIPLIER_SCALE)));
    return (betAmount * scaled) / MULTIPLIER_SCALE;
  }

  private computeWinAmount(betAmount: bigint, multiplier: number): bigint {
    const scaled = BigInt(Math.round(multiplier * Number(MULTIPLIER_SCALE)));
    return (betAmount * scaled) / MULTIPLIER_SCALE;
  }

  private parseBetAmount(input: string): bigint {
    if (!/^(?!0+$)\d+$/.test(input)) {
      throw new BadRequestException("betAmount must be a positive integer string");
    }
    return BigInt(input);
  }

  private toEngineAmount(amount: bigint): number {
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException("Bet amount is too large for Hi-Lo engine");
    }
    return Number(amount);
  }

  private async getRoundRecord(ctx: AuthContext): Promise<HiloPersistedRoundRecord | null> {
    return this.kvStore.get<HiloPersistedRoundRecord>(this.roundKey(ctx));
  }

  private async saveRoundRecord(ctx: AuthContext, record: HiloPersistedRoundRecord): Promise<void> {
    await this.kvStore.set(this.roundKey(ctx), record, ROUND_TTL_SECONDS);
  }

  private roundKey(ctx: AuthContext): string {
    return `hilo:round:${ctx.operatorId}:${ctx.mode}:${ctx.userId}`;
  }

  private userLockKey(ctx: AuthContext): string {
    return `hilo:user-lock:${ctx.operatorId}:${ctx.mode}:${ctx.userId}`;
  }

  private idemCacheKey(action: string, ctx: AuthContext, key: string): string {
    return `${GAME}:${action}:${ctx.operatorId}:${ctx.userId}:${ctx.currency}:${ctx.mode}:${key}`;
  }

  private toRoundView(record: HiloPersistedRoundRecord): HiloRoundView {
    return {
      roundId: record.roundId,
      status: record.status,
      currentCard: record.state.currentCard,
      step: record.state.step,
      totalMultiplier: record.state.totalMultiplier,
      maxSteps: record.config.maxSteps,
      finished: record.state.finished,
      baseBet: record.baseBet.toString(),
      currency: record.currency,
      mathVersion: record.mathVersion,
      serverSeedHash: record.serverSeedHash,
      clientSeed: record.clientSeed,
      nonce: record.nonce,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private metricTags(ctx: AuthContext, extra: Record<string, string> = {}): Record<string, string> {
    return {
      game: GAME,
      operatorId: ctx.operatorId,
      mode: ctx.mode,
      currency: ctx.currency,
      ...extra,
    };
  }

  private observeChainLength(ctx: AuthContext, record: HiloPersistedRoundRecord): void {
    this.metrics.observe("hilo_average_chain_length", record.state.step, this.metricTags(ctx));
  }

  private logRound(ctx: AuthContext, record: HiloPersistedRoundRecord, extra: Record<string, unknown> = {}) {
    return {
      operatorId: ctx.operatorId,
      userId: ctx.userId,
      mode: ctx.mode,
      currency: ctx.currency,
      game: GAME,
      roundId: record.roundId,
      serverSeedHash: record.serverSeedHash,
      clientSeed: record.clientSeed,
      nonce: record.nonce,
      mathVersion: record.mathVersion,
      step: record.state.step,
      status: record.status,
      ...extra,
    };
  }
}

function normalizeDirection(value: string): GuessDirection {
  const normalized = value.trim().toLowerCase();
  if (normalized !== "higher" && normalized !== "lower") {
    throw new BadRequestException("direction must be 'higher' or 'lower'");
  }
  return normalized as GuessDirection;
}
