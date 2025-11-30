import { describe, expect, it } from "vitest";
import { GameBetContext } from "@instant-games/core-game-slice";
import { CoinFlipMathConfig, CoinFlipMathEngine, CoinFlipSide } from "../src";

const ctx: GameBetContext = {
  operatorId: "op",
  userId: "player",
  currency: "USD",
  mode: "demo",
  game: "coinflip",
};

const baseConfig: CoinFlipMathConfig = {
  mathVersion: "v1",
  houseEdge: 0,
};

const betAmount = BigInt(100_000);

const makeInput = (side: CoinFlipSide, rngValue: number) => ({
  ctx,
  betAmount,
  payload: { side },
  rng: () => rngValue,
});

describe("CoinFlipMathEngine", () => {
  it("is deterministic for identical inputs", () => {
    const engine = new CoinFlipMathEngine(baseConfig);
    const first = engine.evaluate(makeInput("HEADS", 0.1));
    const second = engine.evaluate(makeInput("HEADS", 0.1));
    expect(second).toEqual(first);
  });

  it("pays out 2x on wins when house edge is zero", () => {
    const engine = new CoinFlipMathEngine(baseConfig);
    const result = engine.evaluate(makeInput("HEADS", 0.1));
    expect(result.payout).toEqual(BigInt(200_000));
    expect(result.metadata).toMatchObject({ outcome: "HEADS", win: true });
  });

  it("applies house edge and caps multiplier when configured", () => {
    const engine = new CoinFlipMathEngine({ mathVersion: "v1", houseEdge: 1, maxMultiplier: 1.9 });
    const result = engine.evaluate(makeInput("TAILS", 0.9));
    expect(result.payout).toEqual(BigInt(190_000));
    expect(result.metadata).toMatchObject({ multiplier: 1.9, win: true });
  });

  it("rejects invalid sides", () => {
    const engine = new CoinFlipMathEngine(baseConfig);
    expect(() =>
      engine.evaluate({
        ctx,
        betAmount,
        payload: { side: "edge" },
        rng: () => 0.2,
      })
    ).toThrowError(/side must be HEADS or TAILS/);
  });

  it("rejects RNG values out of bounds", () => {
    const engine = new CoinFlipMathEngine(baseConfig);
    expect(() => engine.evaluate(makeInput("HEADS", -0.1))).toThrowError(/rng\(\)/);
    expect(() => engine.evaluate(makeInput("HEADS", 1))).toThrowError(/rng\(\)/);
  });

  it("estimates max payout using the computed multiplier", () => {
    const engine = new CoinFlipMathEngine({ mathVersion: "v1", houseEdge: 1 });
    const max = engine.estimateMaxPayout({ ctx, betAmount, payload: { side: "HEADS" } });
    expect(max).toEqual(BigInt(198_000));
  });

  it("produces RTP close to expectation and reflects house edge", () => {
    const rounds = 20_000;
    const samples = generateSamples(rounds);
    const zeroEdgeEngine = new CoinFlipMathEngine({ mathVersion: "v1", houseEdge: 0 });
    const edgeEngine = new CoinFlipMathEngine({ mathVersion: "v1", houseEdge: 1 });

    const zeroEdgeRtp = simulateRtp(zeroEdgeEngine, samples);
    const edgeRtp = simulateRtp(edgeEngine, samples);

    expect(zeroEdgeRtp).toBeGreaterThan(0.98);
    expect(zeroEdgeRtp).toBeLessThan(1.02);
    expect(edgeRtp).toBeLessThan(zeroEdgeRtp);
    expect(edgeRtp).toBeGreaterThan(0.96);
  });
});

function generateSamples(count: number): number[] {
  const samples: number[] = [];
  let seed = 123456;
  for (let i = 0; i < count; i++) {
    seed = (seed * 48271) % 2147483647;
    samples.push((seed % 1_000_000) / 1_000_000);
  }
  return samples;
}

function simulateRtp(engine: CoinFlipMathEngine, samples: number[]): number {
  let returned = 0;
  for (const sample of samples) {
    const result = engine.evaluate(makeInput("HEADS", sample));
    returned += Number(result.payout);
  }
  const totalStaked = Number(betAmount) * samples.length;
  return returned / totalStaked;
}
