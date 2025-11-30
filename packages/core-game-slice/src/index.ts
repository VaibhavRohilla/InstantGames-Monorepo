import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { AuthContext } from "@instant-games/core-auth";
import { GameConfig, IGameConfigService } from "@instant-games/core-config";
import { IDbClient } from "@instant-games/core-db";
import { GameName } from "@instant-games/core-types";
import { IGameRoundRepository } from "@instant-games/core-game-history";
import { IIdempotencyStore } from "@instant-games/core-idempotency";
import { IWalletTransactionRepository } from "@instant-games/core-ledger";
import { ILogger } from "@instant-games/core-logging";
import { IMetrics } from "@instant-games/core-metrics";
import { IProvablyFairStateStore, ProvablyFairContext } from "@instant-games/core-provably-fair";
import { IRiskService, RiskViolationError } from "@instant-games/core-risk";
import { IRngService } from "@instant-games/core-rng";
import { WalletRouter, scopeWalletUserId } from "@instant-games/core-wallet";
import { IBonusPort } from "@instant-games/core-bonus";
import { RgsErrorCode, rgsErrorPayload } from "@instant-games/core-errors";

export interface GameBetContext extends AuthContext {
  game: GameName;
}

export interface GameBetRequest {
  betAmount: bigint;
  payload: Record<string, unknown>;
  clientSeed?: string;
}

export interface GameEvaluationResult {
  payout: bigint;
  metadata: Record<string, unknown>;
}

export interface GameMathEvaluationInput {
  ctx: GameBetContext;
  betAmount: bigint;
  payload: Record<string, unknown>;
  rng: () => number;
  /**
   * Optional provably-fair context exposed for logging/auditing only.
   * Engines must rely on the provided rng() and never derive their own randomness.
   */
  pf?: {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  };
}

export interface GameMathMaxPayoutInput {
  ctx: GameBetContext;
  betAmount: bigint;
  payload: Record<string, unknown>;
}

export interface IGameMathEngine {
  evaluate(input: GameMathEvaluationInput): GameEvaluationResult;
  estimateMaxPayout?(input: GameMathMaxPayoutInput): bigint;
}

export interface GameBetRunnerResult {
  roundId: string;
  betAmount: bigint;
  payout: bigint;
  currency: string;
  result: "WIN" | "LOSE";
  metadata: Record<string, unknown>;
  createdAt: string;
  mathVersion: string;
  pf: {
    serverSeedHash: string;
    serverSeedId: string;
    clientSeed: string;
    nonce: number;
  };
}

export interface GameBetRunnerParams {
  ctx: GameBetContext;
  request: GameBetRequest;
  idempotencyKey: string;
  mathEngine: IGameMathEngine;
  configService: IGameConfigService;
  riskService: IRiskService;
  provablyFairStore: IProvablyFairStateStore;
  rngService: IRngService;
  walletRouter: WalletRouter;
  roundRepoFactory: (tx: IDbClient) => IGameRoundRepository;
  ledgerRepoFactory: (tx: IDbClient) => IWalletTransactionRepository;
  bonusService: IBonusPort;
  idempotencyStore: IIdempotencyStore;
  logger: ILogger;
  metrics: IMetrics;
  db: IDbClient;
  idempotencyTtlSeconds?: number;
  preloadedConfig?: GameConfig;
}

const RISK_ERROR_CODE_MAP: Record<string, RgsErrorCode> = {
  BET_UNDER_MIN_LIMIT: RgsErrorCode.BET_UNDER_MIN_LIMIT,
  BET_OVER_MAX_LIMIT: RgsErrorCode.BET_OVER_MAX_LIMIT,
  PAYOUT_OVER_LIMIT: RgsErrorCode.PAYOUT_OVER_LIMIT,
  BET_RATE_LIMIT_EXCEEDED: RgsErrorCode.LIMIT_VIOLATION,
};

@Injectable()
export class GameBetRunner {
  async run(params: GameBetRunnerParams): Promise<GameBetRunnerResult> {
    const { idempotencyStore, idempotencyKey, ctx, logger, metrics } = params;
    const cacheKey = `${ctx.game}:${ctx.operatorId}:${ctx.userId}:${ctx.currency}:${ctx.mode}:${idempotencyKey}`;
    const ttl = params.idempotencyTtlSeconds ?? 60;

    try {
      return await idempotencyStore.performOrGetCached(
        cacheKey,
        ttl,
        () => this.execute(params),
        {
          onCached: (cached) => {
            logger.info(`${ctx.game}.bet.idempotent.cached`, this.logFields(ctx, { idempotencyKey, roundId: cached.roundId }));
            metrics.increment("bets_total", {
              game: ctx.game,
              operatorId: ctx.operatorId,
              mode: ctx.mode,
              status: "cached",
            });
          },
        }
      );
    } catch (err) {
      if (err instanceof Error && err.message === "IDEMPOTENCY_IN_PROGRESS") {
        logger.warn(`${ctx.game}.bet.idempotent.conflict`, this.logFields(ctx, { idempotencyKey }));
        throw new ConflictException("Idempotent request is still processing");
      }
      throw err;
    }
  }

  private async execute(params: GameBetRunnerParams): Promise<GameBetRunnerResult> {
    const {
      ctx,
      request,
      mathEngine,
      configService,
      riskService,
      provablyFairStore,
      rngService,
      walletRouter,
      roundRepoFactory,
      ledgerRepoFactory,
      bonusService,
      logger,
      metrics,
      db,
      preloadedConfig,
    } = params;

    const start = Date.now();
    const betAmount = request.betAmount;
    const payload = request.payload ?? {};
    logger.info(`${ctx.game}.bet.started`, this.logFields(ctx, { betAmount: betAmount.toString() }));

    const config = preloadedConfig ?? (await configService.getConfig({ ctx, game: ctx.game }));
    if (ctx.mode === "demo" && !config.demoEnabled) {
      throw new ForbiddenException(
        rgsErrorPayload(RgsErrorCode.MODE_DISABLED, "Demo mode is disabled for this operator and currency")
      );
    }
    if (ctx.mode === "real" && !config.realEnabled) {
      throw new ForbiddenException(
        rgsErrorPayload(RgsErrorCode.MODE_DISABLED, "Real-money mode is disabled for this operator and currency")
      );
    }

    const potentialPayout =
      mathEngine.estimateMaxPayout?.({ ctx, betAmount, payload }) ?? betAmount;
    try {
      await riskService.validateBet({ ctx, game: ctx.game, betAmount, potentialPayout });
    } catch (err) {
      if (err instanceof RiskViolationError) {
        const code = RISK_ERROR_CODE_MAP[err.message] ?? RgsErrorCode.LIMIT_VIOLATION;
        throw new BadRequestException(rgsErrorPayload(code, err.message));
      }
      throw err;
    }

    const wallet = walletRouter.resolve(ctx.mode);
    const scopedUserId = scopeWalletUserId(ctx.operatorId, ctx.userId);
    const balanceBefore = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);

    let debited = false;
    let settled = false;
    let payoutCredited = false;
    let balanceAfterBet: bigint | null = null;
    let balanceAfterPayout: bigint | null = null;
    let roundId: string | null = null;
    let evaluation: GameEvaluationResult | null = null;
    let pfContext: ProvablyFairContext | null = null;
    let nonce = 0;

    try {
      await wallet.debitIfSufficient(scopedUserId, betAmount, ctx.currency, ctx.mode);
      debited = true;
      metrics.increment("wallet_operations_total", this.walletMetricLabels(ctx, "debit"));
      balanceAfterBet = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);

      pfContext = await provablyFairStore.getOrInitContext({
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        userId: ctx.userId,
        game: ctx.game,
        clientSeed: request.clientSeed,
      });
      nonce = await provablyFairStore.nextNonce({
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        userId: ctx.userId,
        game: ctx.game,
      });

      let rngConsumed = false;
      const rng = () => {
        if (rngConsumed) {
          throw new Error("Multiple RNG draws per bet are not supported yet");
        }
        rngConsumed = true;
        return rngService.rollFloat(pfContext!, nonce);
      };

      evaluation = mathEngine.evaluate({
        ctx,
        betAmount,
        payload,
        rng,
        pf: {
          serverSeed: pfContext!.serverSeed,
          clientSeed: pfContext!.clientSeed,
          nonce,
        },
      });

      if (evaluation.payout > BigInt(0)) {
        await wallet.credit(scopedUserId, evaluation.payout, ctx.currency, ctx.mode);
        payoutCredited = true;
        metrics.increment("wallet_operations_total", this.walletMetricLabels(ctx, "credit"));
        balanceAfterPayout = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);
      }

      const settledRound = await db.transaction(async (tx) => {
        const roundRepo = roundRepoFactory(tx);
        const ledgerRepo = ledgerRepoFactory(tx);

        const round = await roundRepo.createPending({
          game: ctx.game,
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
          meta: { bet: payload, pfSeedId: pfContext!.serverSeedId },
        });
        roundId = round.id;

        const settledRecord = await roundRepo.markSettled(round.id, evaluation!.payout, {
          evaluation: evaluation!.metadata,
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
          game: ctx.game,
          roundId: round.id,
          createdAt: new Date(),
          meta: { bet: payload },
        });

        if (evaluation!.payout > BigInt(0) && balanceAfterPayout !== null) {
          await ledgerRepo.log({
            id: randomUUID(),
            userId: ctx.userId,
            operatorId: ctx.operatorId,
            mode: ctx.mode,
            currency: ctx.currency,
            amount: evaluation!.payout,
            balanceBefore: balanceAfterPayout - evaluation!.payout,
            balanceAfter: balanceAfterPayout,
            type: "PAYOUT",
            game: ctx.game,
            roundId: round.id,
            createdAt: new Date(),
            meta: evaluation!.metadata,
          });
        }

        return settledRecord;
      });
      settled = true;

      await bonusService.onRoundSettled({
        ctx,
        game: ctx.game,
        roundId: roundId!,
        betAmount,
        payoutAmount: evaluation.payout,
        mode: ctx.mode,
      });

      metrics.increment("bets_total", {
        game: ctx.game,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        status: "success",
      });
      metrics.observe("round_latency_ms", Date.now() - start, {
        game: ctx.game,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
      });
      logger.info(
        `${ctx.game}.bet.settled`,
        this.logFields(ctx, {
          roundId: roundId!,
          betAmount: betAmount.toString(),
          payout: evaluation.payout.toString(),
        })
      );

      return {
        roundId: settledRound.id,
        betAmount,
        payout: evaluation.payout,
        currency: ctx.currency,
        result: evaluation.payout > BigInt(0) ? "WIN" : "LOSE",
        metadata: {
          evaluation: evaluation.metadata,
          bet: payload,
        },
        createdAt: settledRound.createdAt.toISOString(),
        mathVersion: config.mathVersion,
        pf: {
          serverSeedHash: pfContext!.serverSeedHash,
          serverSeedId: pfContext!.serverSeedId,
          clientSeed: pfContext!.clientSeed,
          nonce,
        },
      };
    } catch (error) {
      metrics.increment("bets_total", {
        game: ctx.game,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        status: "failure",
      });
      logger.error(
        `${ctx.game}.bet.failed`,
        this.logFields(ctx, {
          roundId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      if (payoutCredited && evaluation && evaluation.payout > BigInt(0)) {
        await wallet
          .debitIfSufficient(scopedUserId, evaluation.payout, ctx.currency, ctx.mode)
          .catch(() => logger.error("wallet.rollback_payout_failed"));
      }
      if (debited && !settled) {
        try {
          await wallet.credit(scopedUserId, betAmount, ctx.currency, ctx.mode);
          metrics.increment("wallet_operations_total", this.walletMetricLabels(ctx, "refund"));
          const balanceAfterRefund = await wallet.getBalance(scopedUserId, ctx.currency, ctx.mode);
          if (roundId) {
            await this.recordRefund({
              ctx,
              roundId,
              amount: betAmount,
              balanceAfterRefund,
              db,
              roundRepoFactory,
              ledgerRepoFactory,
            });
          }
          logger.info(`${ctx.game}.bet.refunded`, this.logFields(ctx, { roundId, amount: betAmount.toString() }));
        } catch {
          logger.error("wallet.refund_failed");
        }
      }
      throw error;
    }
  }

  private walletMetricLabels(ctx: GameBetContext, type: string): Record<string, string> {
    return {
      game: ctx.game,
      operatorId: ctx.operatorId,
      mode: ctx.mode,
      type,
    };
  }

  private logFields(ctx: GameBetContext, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      operatorId: ctx.operatorId,
      userId: ctx.userId,
      game: ctx.game,
      mode: ctx.mode,
      currency: ctx.currency,
      ...extra,
    };
  }

  private async recordRefund(params: {
    ctx: GameBetContext;
    roundId: string;
    amount: bigint;
    balanceAfterRefund: bigint;
    db: IDbClient;
    roundRepoFactory: (tx: IDbClient) => IGameRoundRepository;
    ledgerRepoFactory: (tx: IDbClient) => IWalletTransactionRepository;
  }): Promise<void> {
    const { ctx, roundId, amount, balanceAfterRefund, db, roundRepoFactory, ledgerRepoFactory } = params;
    await db.transaction(async (tx) => {
      const roundRepo = roundRepoFactory(tx);
      const ledgerRepo = ledgerRepoFactory(tx);

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
        game: ctx.game,
        roundId,
        createdAt: new Date(),
        meta: {},
      });
    });
  }
}

