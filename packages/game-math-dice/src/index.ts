import {
  GameEvaluationResult,
  GameMathEvaluationInput,
  GameMathMaxPayoutInput,
} from "@instant-games/core-game-slice";

export type DiceCondition = "over" | "under";

export interface DiceMathConfig {
  mathVersion: string;
  houseEdge: number;    // in percent, e.g. 1.0 = 1% house edge
  minTarget: number;    // inclusive
  maxTarget: number;    // inclusive
  maxMultiplier?: number;
}

export interface DiceBetInput {
  target: number;
  condition: DiceCondition;
}

export interface DiceEvaluationMetadata extends Record<string, unknown> {
  rolled: number;
  win: boolean;
  multiplier: number;
  target: number;
  condition: DiceCondition;
}

const MULTIPLIER_SCALE = 10_000n;

export class DiceMathEngine {
  private readonly config: DiceMathConfig;

  constructor(config: DiceMathConfig) {
    this.config = this.validateConfig(config);
  }

  evaluate(input: GameMathEvaluationInput): GameEvaluationResult {
    const rng = input.rng;
    if (typeof rng !== "function") {
      throw new Error("Dice: rng() source is required");
    }

    const bet = this.toBetInput(input.payload ?? {});
    this.validateBet(bet);

    const multiplier = this.computeMultiplier(bet);

    const rand = rng();
    this.assertRngValue(rand);

    const rolled = this.roll(rand);
    const win = this.didPlayerWin(bet, rolled);
    const payout = win ? this.applyMultiplier(input.betAmount, multiplier) : BigInt(0);

    return {
      payout,
      metadata: {
        rolled,
        win,
        multiplier,
        target: bet.target,
        condition: bet.condition,
      } satisfies DiceEvaluationMetadata,
    };
  }

  estimateMaxPayout(input: GameMathMaxPayoutInput): bigint {
    const bet = this.toBetInput(input.payload ?? {});
    this.validateBet(bet);
    const multiplier = this.computeMultiplier(bet);
    return this.applyMultiplier(input.betAmount, multiplier);
  }

  // ---------- config & bet validation ----------

  private validateConfig(config: DiceMathConfig): DiceMathConfig {
    if (!Number.isFinite(config.houseEdge)) {
      throw new Error("Dice: houseEdge must be a finite number");
    }
    // you can tighten these bounds if you want: e.g. 0 <= houseEdge <= 10
    if (config.houseEdge < 0 || config.houseEdge >= 100) {
      throw new Error("Dice: houseEdge must be in [0, 100)");
    }

    if (!Number.isFinite(config.minTarget) || !Number.isFinite(config.maxTarget)) {
      throw new Error("Dice: minTarget/maxTarget must be finite numbers");
    }
    if (config.minTarget >= config.maxTarget) {
      throw new Error("Dice: minTarget must be < maxTarget");
    }
    // Optional: clamp to [1, 99] if your dice is always 1–100
    if (config.minTarget < 1 || config.maxTarget > 99) {
      throw new Error("Dice: minTarget/maxTarget must be within [1, 99]");
    }

    if (config.maxMultiplier != null) {
      if (!Number.isFinite(config.maxMultiplier) || config.maxMultiplier <= 0) {
        throw new Error("Dice: maxMultiplier must be a positive finite number when provided");
      }
    }

    return { ...config };
  }

  private toBetInput(payload: Record<string, unknown>): DiceBetInput {
    const targetRaw = payload["target"];
    const conditionRaw = (payload["condition"] ?? "under") as unknown;

    const target = Number(targetRaw);
    if (!Number.isFinite(target)) {
      throw new Error("Dice: target must be a finite number");
    }

    let condition: DiceCondition;
    if (typeof conditionRaw === "string") {
      const normalized = conditionRaw.toLowerCase();
      if (normalized === "over" || normalized === "under") {
        condition = normalized;
      } else {
        throw new Error("Dice: condition must be 'over' or 'under'");
      }
    } else {
      throw new Error("Dice: condition must be 'over' or 'under'");
    }

    return { target, condition };
  }

  private validateBet(bet: DiceBetInput): void {
    if (
      bet.target < this.config.minTarget ||
      bet.target > this.config.maxTarget
    ) {
      throw new Error("INVALID_TARGET");
    }
  }

  // ---------- core math ----------

  private didPlayerWin(bet: DiceBetInput, rolled: number): boolean {
    return bet.condition === "over" ? rolled > bet.target : rolled < bet.target;
  }

  private computeMultiplier(bet: DiceBetInput): number {
    const probability =
      bet.condition === "over"
        ? (100 - bet.target) / 100
        : bet.target / 100;

    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
      throw new Error("INVALID_PROBABILITY");
    }

    const edgeFactor = 1 - this.config.houseEdge / 100;
    if (!Number.isFinite(edgeFactor) || edgeFactor <= 0) {
      throw new Error("Dice: INVALID_HOUSE_EDGE");
    }

    let multiplier = edgeFactor / probability;

    if (this.config.maxMultiplier != null) {
      multiplier = Math.min(multiplier, this.config.maxMultiplier);
    }

    // Align with CoinFlip: keep 4 decimal places
    return Number(multiplier.toFixed(4));
  }

  private applyMultiplier(amount: bigint, multiplier: number): bigint {
    if (amount <= 0n) {
      throw new Error("Dice: betAmount must be positive");
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error("Dice: multiplier must be a positive finite number");
    }

    const scaledMultiplier = BigInt(Math.round(multiplier * Number(MULTIPLIER_SCALE)));
    return (amount * scaledMultiplier) / MULTIPLIER_SCALE;
  }

  private assertRngValue(rand: number): void {
    if (!Number.isFinite(rand) || rand < 0 || rand >= 1) {
      throw new Error("Dice: rng() must produce 0 <= r < 1");
    }
  }

  private roll(rand: number): number {
    // rand is already validated to [0,1)
    const value = Math.floor(rand * 100) + 1; // [1, 100]
    // extra guard in case of numerical weirdness
    return Math.min(100, Math.max(1, value));
  }
}
