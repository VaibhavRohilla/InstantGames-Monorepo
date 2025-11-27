import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { AuthContext } from "@instant-games/core-auth";
import { GAME_CONFIG_SERVICE, IGameConfigService } from "@instant-games/core-config";
import { DiceMathEngine, DiceBetInput, DiceMathConfig, DiceEvaluationResult } from "@instant-games/game-math-dice";
import { DiceBetDto } from "./dto/dice-bet.dto";
import { DiceBetResponse } from "./dto/dice-response.dto";
import { IRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { IProvablyFairStateStore, PROVABLY_FAIR_STATE_STORE, ProvablyFairContext } from "@instant-games/core-provably-fair";
import { WALLET_ROUTER, WalletRouter, scopeWalletUserId } from "@instant-games/core-wallet";
import { GameRoundRepository } from "@instant-games/core-game-history";
import { WalletTransactionRepository } from "@instant-games/core-ledger";
import { IDEMPOTENCY_STORE, IIdempotencyStore } from "@instant-games/core-idempotency";
import { ILogger, LOGGER } from "@instant-games/core-logging";
import { IMetrics, METRICS } from "@instant-games/core-metrics";
import { IRiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { IBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { GameName } from "@instant-games/core-types";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";

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
  ) {}

  async placeBet(ctx: AuthContext, dto: DiceBetDto, idempotencyKey: string): Promise<DiceBetResponse> {
    const runner = () => this.executeBet(ctx, dto);
    const cacheKey = `${GAME}:${ctx.operatorId}:${ctx.userId}:${idempotencyKey}`;
    this.logger.info("dice.bet.received", this.logFields(ctx, { idempotencyKey }));
    try {
      return await this.idempotencyStore.performOrGetCached(cacheKey, 60, runner, {
        onCached: (cached) => {
          this.logger.info(
            "dice.bet.idempotent.cached",
            this.logFields(ctx, { idempotencyKey, roundId: cached.roundId })
          );
          this.metrics.increment("bets_total", {
            game: GAME,
            operatorId: ctx.operatorId,
            mode: ctx.mode,
            status: "cached",
          });
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message === "IDEMPOTENCY_IN_PROGRESS") {
        this.logger.warn("dice.bet.idempotent.conflict", this.logFields(ctx, { idempotencyKey }));
        throw new ConflictException("Idempotent request is still processing");
      }
      throw err;
    }
  }

  private async executeBet(ctx: AuthContext, dto: DiceBetDto): Promise<DiceBetResponse> {
    const start = Date.now();
    const betAmount = BigInt(dto.betAmount);
    this.logger.info("dice.bet.started", this.logFields(ctx, { betAmount: betAmount.toString() }));
    const config = await this.configService.getConfig({ ctx, game: GAME });
    if (ctx.mode === "demo" && !config.demoEnabled) {
      throw new ForbiddenException("MODE_DISABLED");
    }
    if (ctx.mode === "real" && !config.realEnabled) {
      throw new ForbiddenException("MODE_DISABLED");
    }

    const mathConfig = this.buildMathConfig(config.extra ?? {}, config.mathVersion);
    const engine = new DiceMathEngine(mathConfig);
    const bet: DiceBetInput = { target: dto.target, condition: dto.condition };

    const potentialPayout = engine.estimateMaxPayout(betAmount, bet);
    await this.riskService.validateBet({ ctx, game: GAME, betAmount, potentialPayout });

    const wallet = this.walletRouter.resolve(ctx.mode);
    const scopedUserId = scopeWalletUserId(ctx.operatorId, ctx.userId);
    const balanceBefore = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);
    let debited = false;
    let settled = false;
    let payoutCredited = false;
    let balanceAfterBet: bigint | null = null;
    let balanceAfterPayout: bigint | null = null;
    let roundId: string | null = null;
    let evaluation: DiceEvaluationResult | null = null;
    let pfContext: ProvablyFairContext | null = null;
    let nonce = 0;
    let rolled = 0;

    try {
      await wallet.debitIfSufficient(scopedUserId, betAmount, ctx.currency, ctx.mode);
      debited = true;
      this.metrics.increment("wallet_operations_total", this.walletMetricLabels(ctx, "debit"));
      balanceAfterBet = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);
      pfContext = await this.provablyFairStore.getOrInitContext({
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        userId: ctx.userId,
        game: GAME,
        clientSeed: dto.clientSeed,
      });
      nonce = await this.provablyFairStore.nextNonce({
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        userId: ctx.userId,
        game: GAME,
      });
      rolled = this.rng.rollInt(pfContext, nonce, 1, 100);

      evaluation = engine.evaluate(betAmount, bet, rolled);
      if (evaluation.payout > BigInt(0)) {
        await wallet.credit(scopedUserId, evaluation.payout, ctx.currency, ctx.mode);
        payoutCredited = true;
         this.metrics.increment("wallet_operations_total", this.walletMetricLabels(ctx, "credit"));
        balanceAfterPayout = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);
      }

      const settledRound = await this.db.transaction(async (tx) => {
        const roundRepo = new GameRoundRepository(tx);
        const ledgerRepo = new WalletTransactionRepository(tx);
        const round = await roundRepo.createPending({
          game: GAME,
          userId: ctx.userId,
          operatorId: ctx.operatorId,
          mode: ctx.mode,
          currency: ctx.currency,
          betAmount,
          mathVersion: config.mathVersion,
          serverSeedHash: pfContext!.serverSeedHash,
          serverSeed: pfContext!.serverSeed,
          clientSeed: pfContext!.clientSeed,
          nonce,
          meta: { bet: dto, pfSeedId: pfContext!.serverSeedId },
        });
        roundId = round.id;

        const settledRecord = await roundRepo.markSettled(round.id, evaluation!.payout, {
          rolled,
          result: { ...evaluation!, payout: evaluation!.payout.toString() },
        });

        await ledgerRepo.log({
          id: randomUUID(),
          userId: ctx.userId,
          operatorId: ctx.operatorId,
          mode: ctx.mode,
          currency: ctx.currency,
          amount: -betAmount,
          balanceBefore,
          balanceAfter: balanceAfterBet ?? balanceBefore,
          type: "BET",
          game: GAME,
          roundId: round.id,
          createdAt: new Date(),
          meta: { bet },
        });

        if (evaluation!.payout > BigInt(0) && balanceAfterPayout !== null) {
          await ledgerRepo.log({
            id: randomUUID(),
            userId: ctx.userId,
            operatorId: ctx.operatorId,
            mode: ctx.mode,
            currency: ctx.currency,
            amount: evaluation!.payout,
            balanceBefore: (balanceAfterPayout - evaluation!.payout),
            balanceAfter: balanceAfterPayout,
            type: "PAYOUT",
            game: GAME,
            roundId: round.id,
            createdAt: new Date(),
            meta: { rolled },
          });
        }

        return settledRecord;
      });
      settled = true;

      await this.bonusPort.onRoundSettled({
        ctx,
        game: GAME,
        roundId: roundId!,
        betAmount,
        payoutAmount: evaluation.payout,
        mode: ctx.mode,
      });

      this.metrics.increment("bets_total", {
        game: GAME,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        status: "success",
      });
      this.metrics.observe("round_latency_ms", Date.now() - start, {
        game: GAME,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
      });
      this.logger.info(
        "dice.bet.settled",
        this.logFields(ctx, {
          roundId: roundId!,
          betAmount: betAmount.toString(),
          payout: evaluation.payout.toString(),
        })
      );

      return this.toResponse(settledRound.id, evaluation, pfContext!, nonce, settledRound.createdAt.toISOString(), config.mathVersion, dto);
    } catch (error) {
      this.metrics.increment("bets_total", {
        game: GAME,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        status: "failure",
      });
      this.logger.error(
        "dice.bet.failed",
        this.logFields(ctx, {
          roundId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      if (payoutCredited && evaluation && evaluation.payout > BigInt(0)) {
        await wallet
          .debitIfSufficient(scopedUserId, evaluation.payout, ctx.currency, ctx.mode)
          .catch(() => this.logger.error("wallet.rollback_payout_failed"));
      }
      if (debited && !settled) {
        try {
          await wallet.credit(scopedUserId, betAmount, ctx.currency, ctx.mode);
          this.metrics.increment("wallet_operations_total", this.walletMetricLabels(ctx, "refund"));
          const balanceAfterRefund = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);
          if (roundId) {
            await this.recordRefund(ctx, roundId, betAmount, balanceAfterRefund);
          }
          this.logger.info(
            "dice.bet.refunded",
            this.logFields(ctx, { roundId, amount: betAmount.toString() })
          );
        } catch {
          this.logger.error("wallet.refund_failed");
        }
      }
      throw error;
    }
  }

  private async recordRefund(ctx: AuthContext, roundId: string, amount: bigint, balanceAfterRefund: bigint): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const roundRepo = new GameRoundRepository(tx);
        const ledgerRepo = new WalletTransactionRepository(tx);

        await roundRepo.markCancelled(roundId, "ROUND_ROLLBACK");
        await ledgerRepo.log({
          id: randomUUID(),
          userId: ctx.userId,
          operatorId: ctx.operatorId,
          mode: ctx.mode,
          currency: ctx.currency,
          amount,
          balanceBefore: balanceAfterRefund - amount,
          balanceAfter: balanceAfterRefund,
          type: "REFUND",
          game: GAME,
          roundId,
          createdAt: new Date(),
          meta: {},
        });
      });
    } catch (err) {
      this.logger.error("dice.refund.logging_failed", {
        roundId,
        operatorId: ctx.operatorId,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  private walletMetricLabels(ctx: AuthContext, type: string): Record<string, string> {
    return {
      game: GAME,
      operatorId: ctx.operatorId,
      mode: ctx.mode,
      type,
    };
  }

  private logFields(ctx: AuthContext, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      operatorId: ctx.operatorId,
      userId: ctx.userId,
      game: GAME,
      mode: ctx.mode,
      currency: ctx.currency,
      ...extra,
    };
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

  private toResponse(
    roundId: string,
    evaluation: DiceEvaluationResult,
    pfContext: Pick<ProvablyFairContext, "serverSeedHash" | "clientSeed">,
    nonce: number,
    createdAt: string,
    mathVersion: string,
    dto: DiceBetDto,
  ): DiceBetResponse {
    return {
      roundId,
      betAmount: dto.betAmount,
      payoutAmount: evaluation.payout.toString(),
      rolled: evaluation.rolled,
      target: dto.target,
      condition: dto.condition,
      serverSeedHash: pfContext.serverSeedHash,
      clientSeed: pfContext.clientSeed,
      nonce,
      createdAt,
      mathVersion,
    };
  }
}
