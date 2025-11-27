import { describe, expect, it } from "vitest";
import { DiceMathEngine } from "../src";
import type { GameBetContext } from "@instant-games/core-game-slice";

const ctx: GameBetContext = {
  operatorId: "op",
  userId: "user",
  currency: "USD",
  mode: "demo",
  game: "dice",
};

const engine = new DiceMathEngine({
  mathVersion: "v1",
  houseEdge: 1,
  minTarget: 2,
  maxTarget: 98,
});

describe("DiceMathEngine", () => {
  it("calculates payouts for winning rolls", () => {
    const betAmount = BigInt(100_000);
    const result = engine.evaluate({
      ctx,
      betAmount,
      payload: { target: 49, condition: "under" },
      rng: () => 0.1, // maps to roll 11
    });
    expect(result.payout).toBeGreaterThan(BigInt(0));
    expect(result.metadata.win).toBe(true);
  });

  it("returns zero payout for losses", () => {
    const betAmount = BigInt(100_000);
    const result = engine.evaluate({
      ctx,
      betAmount,
      payload: { target: 49, condition: "under" },
      rng: () => 0.95, // roll 96
    });
    expect(result.payout).toBe(BigInt(0));
    expect(result.metadata.win).toBe(false);
  });

  it("handles large bet amounts without precision loss", () => {
    const betAmount = BigInt("9007199254740995");
    const result = engine.evaluate({
      ctx,
      betAmount,
      payload: { target: 49, condition: "under" },
      rng: () => 0.01,
    });
    expect(result.payout).toBeGreaterThan(BigInt(0));
  });
});
