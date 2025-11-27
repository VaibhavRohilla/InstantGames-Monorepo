import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { AuthContext } from "@instant-games/core-auth";
import { GAME_CONFIG_SERVICE, IGameConfigService } from "@instant-games/core-config";
import { DiceMathEngine, DiceBetInput, DiceMathConfig, DiceEvaluationResult } from "@instant-games/game-math-dice";
import { DiceBetDto } from "./dto/dice-bet.dto";
import { DiceBetResponse } from "./dto/dice-response.dto";
import { IRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { IProvablyFairStateStore, PROVABLY_FAIR_STATE_STORE, ProvablyFairContext } from "@instant-games/core-provably-fair";
import { WALLET_ROUTER, WalletRouter } from "@instant-games/core-wallet";
import { GAME_ROUND_REPOSITORY, IGameRoundRepository } from "@instant-games/core-game-history";
import { WALLET_TRANSACTION_REPOSITORY, IWalletTransactionRepository } from "@instant-games/core-ledger";
import { IDEMPOTENCY_STORE, IIdempotencyStore } from "@instant-games/core-idempotency";
import { ILogger, LOGGER } from "@instant-games/core-logging";
import { IMetrics, METRICS } from "@instant-games/core-metrics";
import { IRiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { IBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { GameName } from "@instant-games/core-types";

const GAME: GameName = "dice";

@Injectable()
export class DiceService {
  constructor(
    @Inject(GAME_CONFIG_SERVICE) private readonly configService: IGameConfigService,
    @Inject(RNG_SERVICE) private readonly rng: IRngService,
    @Inject(PROVABLY_FAIR_STATE_STORE) private readonly provablyFairStore: IProvablyFairStateStore,
    @Inject(WALLET_ROUTER) private readonly walletRouter: WalletRouter,
    @Inject(GAME_ROUND_REPOSITORY) private readonly roundRepository: IGameRoundRepository,
    @Inject(WALLET_TRANSACTION_REPOSITORY) private readonly ledger: IWalletTransactionRepository,
    @Inject(IDEMPOTENCY_STORE) private readonly idempotencyStore: IIdempotencyStore,
    @Inject(LOGGER) private readonly logger: ILogger,
    @Inject(METRICS) private readonly metrics: IMetrics,
    @Inject(RISK_SERVICE) private readonly riskService: IRiskService,
    @Inject(BONUS_PORT) private readonly bonusPort: IBonusPort,
  ) {}

  async placeBet(ctx: AuthContext, dto: DiceBetDto, idempotencyKey?: string): Promise<DiceBetResponse> {
    const runner = () => this.executeBet(ctx, dto);
    if (!idempotencyKey) {
      return runner();
    }
    const cacheKey = `${GAME}:${ctx.userId}:${idempotencyKey}`;
    return this.idempotencyStore.performOrGetCached(cacheKey, 60, runner);
  }

  private async executeBet(ctx: AuthContext, dto: DiceBetDto): Promise<DiceBetResponse> {
    const start = Date.now();
    const betAmount = BigInt(dto.betAmount);
    const config = await this.configService.getConfig({ ctx, game: GAME });
    const mathConfig = this.buildMathConfig(config.extra ?? {}, config.mathVersion);
    const engine = new DiceMathEngine(mathConfig);
    const bet: DiceBetInput = { target: dto.target, condition: dto.condition };

    const potentialPayout = engine.estimateMaxPayout(betAmount, bet);
    await this.riskService.validateBet({ ctx, game: GAME, betAmount, potentialPayout });

    const wallet = this.walletRouter.resolve(ctx.mode);
    const balanceBefore = await wallet.getBalance(ctx.userId, ctx.currency, ctx.mode);
    let debited = false;
    let settled = false;

    try {
      await wallet.debitIfSufficient(ctx.userId, betAmount, ctx.currency, ctx.mode);
      debited = true;
    const pfContext = await this.provablyFairStore.getOrInitContext(ctx.userId, GAME, dto.clientSeed);
    const nonce = await this.provablyFairStore.nextNonce(ctx.userId, GAME);
    const rolled = this.rng.rollInt(pfContext, nonce, 1, 100);

      const round = await this.roundRepository.createPending({
        game: GAME,
        userId: ctx.userId,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        currency: ctx.currency,
        betAmount,
        mathVersion: config.mathVersion,
        serverSeedHash: pfContext.serverSeedHash,
        serverSeed: pfContext.serverSeed,
        clientSeed: pfContext.clientSeed,
        nonce,
        meta: { bet: dto },
      });

      const evaluation = engine.evaluate(betAmount, bet, rolled);
      if (evaluation.payout > BigInt(0)) {
        await wallet.credit(ctx.userId, evaluation.payout, ctx.currency, ctx.mode);
      }
      const settledRound = await this.roundRepository.markSettled(round.id, evaluation.payout, {
        rolled,
        result: { ...evaluation, payout: evaluation.payout.toString() },
      });
      settled = true;

      const balanceAfterBet = await wallet.getBalance(ctx.userId, ctx.currency, ctx.mode);
      await this.ledger.log({
        id: randomUUID(),
        userId: ctx.userId,
        operatorId: ctx.operatorId,
        mode: ctx.mode,
        currency: ctx.currency,
        amount: -betAmount,
        balanceBefore,
        balanceAfter: balanceAfterBet,
        type: "BET",
        game: GAME,
        roundId: round.id,
        createdAt: new Date(),
        meta: { bet },
      });

      if (evaluation.payout > BigInt(0)) {
        const balanceAfterPayout = await wallet.getBalance(ctx.userId, ctx.currency, ctx.mode);
        await this.ledger.log({
          id: randomUUID(),
          userId: ctx.userId,
          operatorId: ctx.operatorId,
          mode: ctx.mode,
          currency: ctx.currency,
          amount: evaluation.payout,
          balanceBefore: balanceAfterPayout - evaluation.payout,
          balanceAfter: balanceAfterPayout,
          type: "PAYOUT",
          game: GAME,
          roundId: round.id,
          createdAt: new Date(),
          meta: { rolled },
        });
      }

      await this.bonusPort.onRoundSettled({
        ctx,
        game: GAME,
        roundId: round.id,
        betAmount,
        payoutAmount: evaluation.payout,
        mode: ctx.mode,
      });

      this.metrics.increment("bets_count", { game: GAME, operator: ctx.operatorId, mode: ctx.mode });
      this.metrics.observe("round_latency_ms", Date.now() - start, { game: GAME });
      this.logger.info("dice.round.settled", {
        userId: ctx.userId,
        operatorId: ctx.operatorId,
        roundId: round.id,
        betAmount: betAmount.toString(),
        payout: evaluation.payout.toString(),
      });

      return this.toResponse(settledRound.id, evaluation, pfContext, nonce, settledRound.createdAt.toISOString(), config.mathVersion, dto);
    } catch (error) {
      this.metrics.increment("bets_failed_count", { reason: error instanceof Error ? error.message : "unknown" });
      this.logger.error("dice.round.failed", {
        userId: ctx.userId,
        operatorId: ctx.operatorId,
        error: error instanceof Error ? error.message : error,
      });
      if (debited && !settled) {
        await wallet.credit(ctx.userId, betAmount, ctx.currency, ctx.mode).catch(() => this.logger.error("wallet.refund_failed"));
      }
      throw error;
    }
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
