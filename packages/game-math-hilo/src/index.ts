import { GameEvaluationResult, GameMathEvaluationInput, GameMathMaxPayoutInput } from "@instant-games/core-game-slice";

export type HiloChoice = "HIGHER" | "LOWER";

export interface HiloMathConfig {
  mathVersion: string;
  houseEdge: number;
  minRank: number;
  maxRank: number;
  maxMultiplier?: number;
}

export interface HiloBetInput {
  currentRank: number;
  choice: HiloChoice;
}

export interface HiloEvaluationMetadata extends Record<string, unknown> {
  currentRank: number;
  drawnRank: number;
  win: boolean;
  multiplier: number;
  choice: HiloChoice;
}

const MULTIPLIER_SCALE = 10_000n;

export class HiloMathEngine {
  private readonly config: HiloMathConfig;

  constructor(config: HiloMathConfig) {
    this.config = this.validateConfig(config);
  }

  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const rng = input.rng;
    if (typeof rng !== "function") {
      throw new Error("Hilo: rng() source is required");
    }

    const bet = this.toBetInput(input.payload ?? {});
    this.validateBet(bet);

    const multiplier = this.computeMultiplier(bet);

    const rand = rng();
    this.assertRngValue(rand);

    const drawnRank = this.drawRank(rand);
    const win = this.didPlayerWin(bet, drawnRank);
    const payout = win ? this.applyMultiplier(input.betAmount, multiplier) : 0n;

    return {
      payout,
      metadata: {
        currentRank: bet.currentRank,
        drawnRank,
        win,
        multiplier,
        choice: bet.choice,
      } satisfies HiloEvaluationMetadata,
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    const bet = this.toBetInput(input.payload ?? {});
    this.validateBet(bet);
    const multiplier = this.computeMultiplier(bet);
    return this.applyMultiplier(input.betAmount, multiplier);
  }

  // ---------- Config & bet validation ----------

  private validateConfig(config: HiloMathConfig): HiloMathConfig {
    if (!Number.isFinite(config.houseEdge)) {
      throw new Error("Hilo: houseEdge must be a finite number");
    }
    if (config.houseEdge < 0 || config.houseEdge >= 100) {
      throw new Error("Hilo: houseEdge must be in [0, 100)");
    }

    if (!Number.isFinite(config.minRank) || !Number.isFinite(config.maxRank)) {
      throw new Error("Hilo: minRank/maxRank must be finite numbers");
    }
    if (config.minRank >= config.maxRank) {
      throw new Error("Hilo: minRank must be < maxRank");
    }

    if (config.maxMultiplier != null) {
      if (!Number.isFinite(config.maxMultiplier) || config.maxMultiplier <= 0) {
        throw new Error("Hilo: maxMultiplier must be a positive finite number when provided");
      }
    }

    return { ...config };
  }

  private toBetInput(payload: Record<string, unknown>): HiloBetInput {
    const currentRankRaw = payload["currentRank"];
    const choiceRaw = payload["choice"];

    const currentRank = Number(currentRankRaw);
    if (!Number.isFinite(currentRank)) {
      throw new Error("Hilo: currentRank must be a finite number");
    }

    if (typeof choiceRaw !== "string") {
      throw new Error("Hilo: choice is required");
    }
    const normalizedChoice = choiceRaw.trim().toUpperCase();
    if (normalizedChoice !== "HIGHER" && normalizedChoice !== "LOWER") {
      throw new Error("Hilo: choice must be 'HIGHER' or 'LOWER'");
    }

    return {
      currentRank,
      choice: normalizedChoice as HiloChoice,
    };
  }

  private validateBet(bet: HiloBetInput): void {
    if (bet.currentRank < this.config.minRank || bet.currentRank > this.config.maxRank) {
      throw new Error("Hilo: currentRank out of range");
    }

    const higherCount = this.config.maxRank - bet.currentRank;
    const lowerCount = bet.currentRank - this.config.minRank;

    if (bet.choice === "HIGHER" && higherCount <= 0) {
      throw new Error("Hilo: cannot bet HIGHER on the highest rank");
    }
    if (bet.choice === "LOWER" && lowerCount <= 0) {
      throw new Error("Hilo: cannot bet LOWER on the lowest rank");
    }
  }

  // ---------- core math ----------

  private computeMultiplier(bet: HiloBetInput): number {
    const totalRanks = this.config.maxRank - this.config.minRank + 1;
    const higherCount = this.config.maxRank - bet.currentRank;
    const lowerCount = bet.currentRank - this.config.minRank;

    let probability: number;
    if (bet.choice === "HIGHER") {
      probability = higherCount / totalRanks;
    } else {
      probability = lowerCount / totalRanks;
    }

    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
      throw new Error("Hilo: INVALID_PROBABILITY");
    }

    const edgeFactor = 1 - this.config.houseEdge / 100;
    if (!Number.isFinite(edgeFactor) || edgeFactor <= 0) {
      throw new Error("Hilo: INVALID_HOUSE_EDGE");
    }

    let multiplier = edgeFactor / probability;

    if (this.config.maxMultiplier != null) {
      multiplier = Math.min(multiplier, this.config.maxMultiplier);
    }

    return Number(multiplier.toFixed(4));
  }

  private didPlayerWin(bet: HiloBetInput, drawnRank: number): boolean {
    if (bet.choice === "HIGHER") {
      return drawnRank > bet.currentRank;
    }
    return drawnRank < bet.currentRank;
  }

  private drawRank(rand: number): number {
    const rangeSize = this.config.maxRank - this.config.minRank + 1;
    const offset = Math.floor(rand * rangeSize);
    const rank = this.config.minRank + offset;
    return Math.min(this.config.maxRank, Math.max(this.config.minRank, rank));
  }

  private applyMultiplier(amount: bigint, multiplier: number): bigint {
    if (amount <= 0n) {
      throw new Error("Hilo: betAmount must be positive");
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error("Hilo: multiplier must be a positive finite number");
    }

    const scaled = BigInt(Math.round(multiplier * Number(MULTIPLIER_SCALE)));
    return (amount * scaled) / MULTIPLIER_SCALE;
  }

  private assertRngValue(rand: number): void {
    if (!Number.isFinite(rand) || rand < 0 || rand >= 1) {
      throw new Error("Hilo: rng() must produce 0 <= r < 1");
    }
  }
}
