export type RouletteBetType = "straight" | "color" | "odd_even";

export interface RouletteBet {
  type: RouletteBetType;
  selection: number | "red" | "black" | "odd" | "even";
}

export interface RouletteConfig {
  mathVersion: string;
  houseEdge: number;
}

export interface RouletteResult {
  number: number;
  payout: bigint;
  multiplier: number;
  win: boolean;
}

export class RouletteEngine {
  constructor(private readonly config: RouletteConfig) {}

  evaluate(betAmount: bigint, bet: RouletteBet, numberRolled: number): RouletteResult {
    const multiplier = this.getMultiplier(bet);
    const win = this.didWin(bet, numberRolled);
    const payout = win ? BigInt(Math.floor(Number(betAmount) * multiplier)) : BigInt(0);
    return { number: numberRolled, payout, multiplier, win };
  }

  private getMultiplier(bet: RouletteBet): number {
    switch (bet.type) {
      case "straight":
        return 35 * (1 - this.config.houseEdge / 100);
      case "color":
      case "odd_even":
        return 2 * (1 - this.config.houseEdge / 100);
      default:
        throw new Error("UNSUPPORTED_BET_TYPE");
    }
  }

  private didWin(bet: RouletteBet, rolled: number): boolean {
    if (bet.type === "straight") {
      return bet.selection === rolled;
    }
    if (bet.type === "color") {
      const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
      const color = reds.has(rolled) ? "red" : "black";
      return bet.selection === color;
    }
    if (bet.type === "odd_even") {
      const parity = rolled % 2 === 0 ? "even" : "odd";
      return bet.selection === parity;
    }
    return false;
  }
}
