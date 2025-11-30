import "reflect-metadata";
import { randomInt } from "crypto";
import { DiceMathEngine } from "@instant-games/game-math-dice";
import { CoinFlipMathEngine, CoinFlipSide } from "@instant-games/game-math-coinflip";
import { RouletteMathEngine } from "@instant-games/game-math-roulette";
import { MinesMathEngine } from "@instant-games/game-math-mines";
import {
  applyGuess as applyHiloGuess,
  startRound as startHiloRound,
  type Card as HiloCard,
  type GuessDirection as HiloGuessDirection,
  type HiloConfig,
} from "@instant-games/game-math-hilo";
import { PlinkoMathEngine } from "@instant-games/game-math-plinko";
import { WheelMathEngine } from "@instant-games/game-math-wheel";
import { KenoMathEngine } from "@instant-games/game-math-keno";
import { GameMode, GameName } from "@instant-games/core-types";

const SIM_CONTEXT = {
  operatorId: "sim",
  userId: "sim",
  currency: "USD",
  mode: "demo" as GameMode,
  game: "dice" as GameName,
};

// ============ Interfaces ============
interface DiceSimOptions {
  rounds: number;
  bet: bigint;
  target: number;
  condition: "over" | "under";
  houseEdge: number;
}

interface CoinFlipSimOptions {
  rounds: number;
  bet: bigint;
  side: CoinFlipSide;
  houseEdge: number;
  maxMultiplier?: number;
}

interface RouletteSimOptions {
  rounds: number;
  bet: bigint;
  selection: number;
}

interface MinesSimOptions {
  rounds: number;
  bet: bigint;
  cell: number;
}

interface HiloSimOptions {
  rounds: number;
  bet: bigint;
  currentRank: number;
  choice: string;
  houseEdge: number;
  minRank: number;
  maxRank: number;
  maxMultiplier?: number;
}

interface PlinkoSimOptions {
  rounds: number;
  bet: bigint;
}

interface WheelSimOptions {
  rounds: number;
  bet: bigint;
}

interface KenoSimOptions {
  rounds: number;
  bet: bigint;
  picks: number[];
}

// ============ Main Function ============
async function main() {
  const [, , game, ...rest] = process.argv;
  if (!game) {
    console.error("Available games: dice, coinflip, roulette, mines, hilo, plinko, wheel, keno");
    console.error("Example: pnpm simulator dice --rounds 1000 --bet 100 --target 50 --condition under");
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
    case "coinflip": {
      const rawSide = typeof args.side === "string" ? args.side : typeof args.choice === "string" ? args.choice : "heads";
      const parsedHouseEdge = Number(args.houseEdge ?? 1);
      const parsedMaxMultiplier = args.maxMultiplier != null ? Number(args.maxMultiplier) : undefined;
      const options: CoinFlipSimOptions = {
        rounds: Number(args.rounds ?? 1000),
        bet: BigInt(args.bet ?? "100"),
        side: normalizeCoinflipSide(rawSide),
        houseEdge: Number.isFinite(parsedHouseEdge) ? parsedHouseEdge : 1,
        maxMultiplier:
          parsedMaxMultiplier != null && Number.isFinite(parsedMaxMultiplier) && parsedMaxMultiplier > 0
            ? parsedMaxMultiplier
            : undefined,
      };
      await runCoinFlipSim(options);
      break;
    }
    case "roulette": {
      const options: RouletteSimOptions = {
        rounds: Number(args.rounds ?? 1000),
        bet: BigInt(args.bet ?? "100"),
        selection: Number(args.selection ?? 0),
      };
      await runRouletteSim(options);
      break;
    }
    case "mines": {
      const options: MinesSimOptions = {
        rounds: Number(args.rounds ?? 1000),
        bet: BigInt(args.bet ?? "100"),
        cell: Number(args.cell ?? 0),
      };
      await runMinesSim(options);
      break;
    }
    case "hilo": {
      const rawMaxMultiplier = args.maxMultiplier != null ? Number(args.maxMultiplier) : undefined;
      const options: HiloSimOptions = {
        rounds: Number(args.rounds ?? 1000),
        bet: BigInt(args.bet ?? "100"),
        currentRank: Number(args.currentRank ?? 7),
        choice: (typeof args.choice === "string" ? args.choice : "higher") ?? "higher",
        houseEdge: Number(args.houseEdge ?? 1),
        minRank: Number(args.minRank ?? 1),
        maxRank: Number(args.maxRank ?? 13),
        maxMultiplier: rawMaxMultiplier != null && Number.isFinite(rawMaxMultiplier) ? rawMaxMultiplier : undefined,
      };
      await runHiloSim(options);
      break;
    }
    case "plinko": {
      const options: PlinkoSimOptions = {
        rounds: Number(args.rounds ?? 1000),
        bet: BigInt(args.bet ?? "100"),
      };
      await runPlinkoSim(options);
      break;
    }
    case "wheel": {
      const options: WheelSimOptions = {
        rounds: Number(args.rounds ?? 1000),
        bet: BigInt(args.bet ?? "100"),
      };
      await runWheelSim(options);
      break;
    }
    case "keno": {
      const picks = args.picks ? args.picks.split(",").map(Number).filter((n) => !isNaN(n)) : [1, 2, 3, 4, 5];
      const options: KenoSimOptions = {
        rounds: Number(args.rounds ?? 1000),
        bet: BigInt(args.bet ?? "100"),
        picks,
      };
      await runKenoSim(options);
      break;
    }
    default:
      console.error(`Unsupported game: ${game}`);
      console.error("Available games: dice, coinflip, roulette, mines, hilo, plinko, wheel, keno");
      process.exit(1);
  }
}

// ============ Helper Functions ============
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

function calculateRTP(totalPayout: bigint, totalBet: bigint): number {
  return Number(totalPayout * BigInt(10000) / (totalBet === BigInt(0) ? BigInt(1) : totalBet)) / 100;
}

// ============ Simulation Functions ============
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
      ctx: { ...SIM_CONTEXT, game: "dice" as GameName },
      betAmount: options.bet,
      payload: { target: options.target, condition: options.condition },
      rng: () => rngValue,
    });
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.metadata.win === true) wins += 1;
  }

  const rtp = calculateRTP(totalPayout, totalBet);

  console.log(JSON.stringify({
    game: "dice",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
    target: options.target,
    condition: options.condition,
    houseEdge: options.houseEdge,
  }, null, 2));
}

async function runCoinFlipSim(options: CoinFlipSimOptions) {
  const engine = new CoinFlipMathEngine({
    mathVersion: "sim",
    houseEdge: options.houseEdge,
    maxMultiplier: options.maxMultiplier,
  });

  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;

  for (let i = 0; i < options.rounds; i++) {
    const rngValue = Math.random();
    const result = engine.evaluate({
      ctx: { ...SIM_CONTEXT, game: "coinflip" as GameName },
      betAmount: options.bet,
      payload: { side: options.side },
      rng: () => rngValue,
    });
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.metadata.win === true) wins += 1;
  }

  const rtp = calculateRTP(totalPayout, totalBet);

  console.log(JSON.stringify({
    game: "coinflip",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
    side: options.side.toLowerCase(),
    houseEdge: options.houseEdge,
    ...(options.maxMultiplier ? { maxMultiplier: options.maxMultiplier } : {}),
  }, null, 2));
}

async function runRouletteSim(options: RouletteSimOptions) {
  const engine = new RouletteMathEngine();

  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;

  for (let i = 0; i < options.rounds; i++) {
    const rngValue = Math.random();
    const result = engine.evaluate({
      ctx: { ...SIM_CONTEXT, game: "roulette" as GameName },
      betAmount: options.bet,
      payload: { selection: options.selection },
      rng: () => rngValue,
    });
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.metadata.win === true) wins += 1;
  }

  const rtp = calculateRTP(totalPayout, totalBet);

  console.log(JSON.stringify({
    game: "roulette",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
    selection: options.selection,
  }, null, 2));
}

async function runMinesSim(options: MinesSimOptions) {
  const engine = new MinesMathEngine();

  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;

  for (let i = 0; i < options.rounds; i++) {
    const rngValue = Math.random();
    const result = engine.evaluate({
      ctx: { ...SIM_CONTEXT, game: "mines" as GameName },
      betAmount: options.bet,
      payload: { cell: options.cell },
      rng: () => rngValue,
    });
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.metadata.win === true) wins += 1;
  }

  const rtp = calculateRTP(totalPayout, totalBet);

  console.log(JSON.stringify({
    game: "mines",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
    cell: options.cell,
  }, null, 2));
}

async function runHiloSim(options: HiloSimOptions) {
  const multiplier = computeHiloMultiplier(options.houseEdge);
  const config: HiloConfig = {
    maxSteps: 1,
    multipliers: [multiplier],
  };
  const direction = normalizeHiloDirection(options.choice);

  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;

  for (let i = 0; i < options.rounds; i++) {
    const deck = buildSimDeck(options.currentRank);
    const state = startHiloRound(deck, Number(options.bet), config);
    const outcome = applyHiloGuess(state, direction, config);
    totalBet += options.bet;
    if (outcome.result === "win") {
      totalPayout += applyMultiplier(options.bet, multiplier);
      wins += 1;
    }
  }

  const rtp = calculateRTP(totalPayout, totalBet);

  console.log(
    JSON.stringify(
      {
        game: "hilo",
        rounds: options.rounds,
        totalBet: totalBet.toString(),
        totalPayout: totalPayout.toString(),
        rtp,
        winRate: wins / options.rounds,
        currentRank: options.currentRank,
        choice: direction,
        houseEdge: options.houseEdge,
      },
      null,
      2,
    ),
  );
}

async function runPlinkoSim(options: PlinkoSimOptions) {
  const engine = new PlinkoMathEngine();

  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;

  for (let i = 0; i < options.rounds; i++) {
    const rngValue = Math.random();
    const result = engine.evaluate({
      ctx: { ...SIM_CONTEXT, game: "plinko" as GameName },
      betAmount: options.bet,
      payload: {},
      rng: () => rngValue,
    });
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.payout > 0n) wins += 1;
  }

  const rtp = calculateRTP(totalPayout, totalBet);

  console.log(JSON.stringify({
    game: "plinko",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
  }, null, 2));
}

async function runWheelSim(options: WheelSimOptions) {
  const engine = new WheelMathEngine();

  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;

  for (let i = 0; i < options.rounds; i++) {
    const rngValue = Math.random();
    const result = engine.evaluate({
      ctx: { ...SIM_CONTEXT, game: "wheel" as GameName },
      betAmount: options.bet,
      payload: {},
      rng: () => rngValue,
    });
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.payout > 0n) wins += 1;
  }

  const rtp = calculateRTP(totalPayout, totalBet);

  console.log(JSON.stringify({
    game: "wheel",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
  }, null, 2));
}

async function runKenoSim(options: KenoSimOptions) {
  const engine = new KenoMathEngine();

  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;

  for (let i = 0; i < options.rounds; i++) {
    const rngValue = Math.random();
    const result = engine.evaluate({
      ctx: { ...SIM_CONTEXT, game: "keno" as GameName },
      betAmount: options.bet,
      payload: { picks: options.picks },
      rng: () => rngValue,
    });
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.payout > 0n) wins += 1;
  }

  const rtp = calculateRTP(totalPayout, totalBet);

  console.log(JSON.stringify({
    game: "keno",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
    picks: options.picks,
  }, null, 2));
}

function computeHiloMultiplier(houseEdge: number): number {
  const edgeFactor = 1 - (Number.isFinite(houseEdge) ? houseEdge : 0) / 100;
  return Number((2 * Math.max(edgeFactor, 0.01)).toFixed(4));
}

function normalizeHiloDirection(direction: string): HiloGuessDirection {
  const normalized = (direction ?? "higher").trim().toLowerCase();
  return normalized === "lower" ? "lower" : "higher";
}

function buildSimDeck(currentRank: number): HiloCard[] {
  const rank = clampRank(currentRank);
  const nextRank = randomInt(2, 15);
  return [
    { rank, suit: randomSuit() },
    { rank: nextRank, suit: randomSuit() },
    { rank: clampRank(rank + 1), suit: randomSuit() },
  ];
}

function clampRank(rank: number): number {
  return Math.max(2, Math.min(14, Math.trunc(rank)));
}

function randomSuit(): HiloCard["suit"] {
  const suits: HiloCard["suit"][] = ["clubs", "diamonds", "hearts", "spades"];
  return suits[randomInt(0, suits.length)];
}

function normalizeCoinflipSide(side: string | undefined): CoinFlipSide {
  const normalized = (side ?? "heads").trim().toUpperCase();
  return normalized === "TAILS" ? "TAILS" : "HEADS";
}

function applyMultiplier(amount: bigint, multiplier: number): bigint {
  const scaled = BigInt(Math.round(multiplier * Number(10_000)));
  return (amount * scaled) / BigInt(10_000);
}

void main();
