import { Inject, Injectable } from "@nestjs/common";
import { AuthContext } from "@instant-games/core-auth";
import { GAME_CONFIG_SERVICE, GameConfig, IGameConfigService } from "@instant-games/core-config";
import { Suit } from "@instant-games/game-math-hilo";
import { HiloResolvedConfig, HiloRuntimeConfig } from "./hilo.types";

const DEFAULT_MULTIPLIERS = [1.32, 1.65, 2.1, 2.8, 3.7, 5, 6.5];

@Injectable()
export class HiloConfigService {
  constructor(@Inject(GAME_CONFIG_SERVICE) private readonly configService: IGameConfigService) {}

  async getConfig(ctx: AuthContext): Promise<HiloResolvedConfig> {
    const baseConfig = await this.configService.getConfig({ ctx, game: "hilo" });
    const runtime = this.buildRuntimeConfig(baseConfig);
    return { base: baseConfig, runtime };
  }

  private buildRuntimeConfig(config: GameConfig): HiloRuntimeConfig {
    const extra = config.extra ?? {};
    const maxSteps = this.parseMaxSteps(extra["maxSteps"]);
    const multipliers = this.parseMultipliers(extra["multipliers"], maxSteps);
    const suitOrder = this.parseSuitOrder(extra["suitOrder"]);

    return {
      mathVersion: config.mathVersion,
      minBet: config.minBet,
      maxBet: config.maxBet,
      maxPayoutPerRound: config.maxPayoutPerRound,
      maxSteps,
      multipliers,
      suitOrder,
    };
  }

  private parseMaxSteps(input: unknown): number {
    if (input == null) {
      return DEFAULT_MULTIPLIERS.length;
    }
    const value = Number(input);
    if (!Number.isInteger(value) || value <= 0 || value > 52) {
      throw new Error("Hilo: maxSteps must be an integer between 1 and 52");
    }
    return value;
  }

  private parseMultipliers(input: unknown, maxSteps: number): number[] {
    const fallback = DEFAULT_MULTIPLIERS.slice(0, maxSteps);
    if (!Array.isArray(input)) {
      if (fallback.length < maxSteps) {
        throw new Error("Hilo: maxSteps exceeds default multipliers length");
      }
      return fallback;
    }

    const values = input.map((value, idx) => {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 1) {
        throw new Error(`Hilo: multipliers[${idx}] must be > 1`);
      }
      return Number(num.toFixed(4));
    });

    if (values.length < maxSteps) {
      throw new Error("Hilo: multipliers array must cover every step up to maxSteps");
    }

    return values.slice(0, maxSteps);
  }

  private parseSuitOrder(input: unknown): Suit[] | undefined {
    if (input == null) {
      return undefined;
    }
    if (!Array.isArray(input)) {
      throw new Error("Hilo: suitOrder must be an array");
    }
    const suits = input.map((value) => {
      if (typeof value !== "string") {
        throw new Error("Hilo: suitOrder entries must be strings");
      }
      const normalized = value.toLowerCase().trim();
      if (normalized !== "clubs" && normalized !== "diamonds" && normalized !== "hearts" && normalized !== "spades") {
        throw new Error(`Hilo: invalid suit '${value}' in suitOrder`);
      }
      return normalized as Suit;
    });
    if (suits.length !== 4 || new Set(suits).size !== 4) {
      throw new Error("Hilo: suitOrder must contain four unique suits");
    }
    return suits;
  }
}

