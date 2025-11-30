import { describe, expect, it } from "vitest";
import type { GameBetContext } from "@instant-games/core-game-slice";
import { HiloMathEngine, type HiloMathConfig } from "../src";

const ctx: GameBetContext = {
  operatorId: "op",
  userId: "user",
  currency: "USD",
  mode: "demo",
  game: "hilo",
};

const baseConfig: HiloMathConfig = {
  mathVersion: "v1",
  houseEdge: 1,
  minRank: 1,
  maxRank: 13,
};

describe("HiloMathEngine", () => {
  it("produces deterministic results for identical RNG", () => {
    const engine = new HiloMathEngine(baseConfig);
    const betAmount = BigInt(1_000);
    const payload = { currentRank: 7, choice: "HIGHER" };
    const rngValue = 0.42;

    const first = engine.evaluate({ ctx, betAmount, payload, rng: () => rngValue });
    const second = engine.evaluate({ ctx, betAmount, payload, rng: () => rngValue });

    expect(second).toStrictEqual(first);
  });

  it("rejects impossible bets at the bounds", () => {
    const engine = new HiloMathEngine(baseConfig);
    const betAmount = BigInt(100);

    expect(() =>
      engine.evaluate({ ctx, betAmount, payload: { currentRank: 13, choice: "HIGHER" }, rng: () => 0.1 }),
    ).toThrow(/HIGHER/);
    expect(() =>
      engine.evaluate({ ctx, betAmount, payload: { currentRank: 1, choice: "LOWER" }, rng: () => 0.1 }),
    ).toThrow(/LOWER/);
  });

  it("returns ~100% RTP when house edge is zero", () => {
    const config: HiloMathConfig = { ...baseConfig, houseEdge: 0 };
    const payload = { currentRank: 7, choice: "HIGHER" };
    const betAmount = BigInt(10_000);

    const rtp = computeExpectedRtp(config, payload, betAmount);
    expect(rtp).toBeCloseTo(1, 4);
  });

  it("returns <100% RTP when house edge is positive", () => {
    const config: HiloMathConfig = { ...baseConfig, houseEdge: 1.5 };
    const payload = { currentRank: 8, choice: "LOWER" };
    const betAmount = BigInt(10_000);

    const rtp = computeExpectedRtp(config, payload, betAmount);
    expect(rtp).toBeLessThan(1);
    expect(rtp).toBeCloseTo(0.985, 2);
  });
});

function computeExpectedRtp(
  config: HiloMathConfig,
  payload: { currentRank: number; choice: "HIGHER" | "LOWER" },
  betAmount: bigint,
): number {
  const engine = new HiloMathEngine(config);
  const totalOutcomes = config.maxRank - config.minRank + 1;
  let expectedPayout = 0;

  for (let rank = config.minRank; rank <= config.maxRank; rank += 1) {
    const idx = rank - config.minRank;
    const rngValue = (idx + 0.5) / totalOutcomes;
    const result = engine.evaluate({
      ctx,
      betAmount,
      payload,
      rng: () => rngValue,
    });
    expectedPayout += Number(result.payout) / totalOutcomes;
  }

  return expectedPayout / Number(betAmount);
}

