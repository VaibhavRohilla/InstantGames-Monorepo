import { describe, expect, it } from "vitest";
import { DiceMathEngine } from "@instant-games/game-math-dice";

const engine = new DiceMathEngine({
  mathVersion: "v1",
  houseEdge: 1,
  minTarget: 2,
  maxTarget: 98,
});

describe("DiceMathEngine", () => {
  it("calculates payouts for winning rolls", () => {
    const betAmount = BigInt(100_000);
    const result = engine.evaluate(betAmount, { target: 49, condition: "under" }, 10);
    expect(result.win).toBe(true);
    expect(result.payout).toBeGreaterThan(BigInt(0));
  });

  it("returns zero payout for losses", () => {
    const betAmount = BigInt(100_000);
    const result = engine.evaluate(betAmount, { target: 49, condition: "under" }, 90);
    expect(result.win).toBe(false);
    expect(result.payout).toBe(BigInt(0));
  });

  it("handles large bet amounts without precision loss", () => {
    const betAmount = BigInt("9007199254740995");
    const result = engine.evaluate(betAmount, { target: 49, condition: "under" }, 10);
    expect(result.win).toBe(true);
    expect(result.payout).toBeGreaterThan(BigInt(0));
  });
});
