import "reflect-metadata";
import { randomInt } from "crypto";
import { DiceMathEngine } from "@instant-games/game-math-dice";
import { GameMode, GameName } from "@instant-games/core-types";
const SIM_CONTEXT = {
  operatorId: "sim",
  userId: "sim",
  currency: "USD",
  mode: "demo" as GameMode,
  game: "dice" as GameName,
};


interface DiceSimOptions {
  rounds: number;
  bet: bigint;
  target: number;
  condition: "over" | "under";
  houseEdge: number;
}

async function main() {
  const [, , game, ...rest] = process.argv;
  if (!game) {
    console.error("Usage: pnpm simulator dice --rounds 1000 --bet 100 --target 50 --condition under");
    process.exit(1);
  }

  const args = parseArgs(rest);

  switch (game) {
    case "dice": {
      const options: DiceSimOptions = {
        rounds: Number(args.rounds ?? 1000),
        bet: BigInt(args.bet ?? "100"),
        target: Number(args.target ?? 50),
        condition: (args.condition as "over" | "under") ?? "under",
        houseEdge: Number(args.houseEdge ?? 1),
      };
      await runDiceSim(options);
      break;
    }
    default:
      console.error(`Unsupported game: ${game}`);
      process.exit(1);
  }
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        result[key] = value;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

async function runDiceSim(options: DiceSimOptions) {
  const engine = new DiceMathEngine({
    mathVersion: "v1",
    houseEdge: options.houseEdge,
    minTarget: 2,
    maxTarget: 98,
  });

  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;

  for (let i = 0; i < options.rounds; i++) {
    const roll = randomInt(1, 101);
    const rngValue = (roll - 1) / 100;
    const result = engine.evaluate({
      ctx: SIM_CONTEXT,
      betAmount: options.bet,
      payload: { target: options.target, condition: options.condition },
      rng: () => rngValue,
    });
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.metadata.win === true) wins += 1;
  }

  const rtp = Number(totalPayout * BigInt(10000) / (totalBet === BigInt(0) ? BigInt(1) : totalBet)) / 100;

  console.log(JSON.stringify({
    game: "dice",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
    target: options.target,
    condition: options.condition,
  }, null, 2));
}

void main();
