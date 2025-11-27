import { describe, expect, it } from "vitest";
import { ProvablyFairService } from "@instant-games/core-provably-fair";

const service = new ProvablyFairService();

describe("ProvablyFairService", () => {
  it("generates deterministic rolls for same context", () => {
    const ctx = {
      game: "dice" as const,
      userId: "user1",
      serverSeed: "server-seed",
      serverSeedHash: service.hashServerSeed("server-seed"),
      clientSeed: "client-seed",
      nonce: 0,
    };

    const rollA = service.rollInt(ctx, 1, 1, 100);
    const rollB = service.rollInt(ctx, 1, 1, 100);

    expect(rollA).toBe(rollB);
    expect(rollA).toBeGreaterThanOrEqual(1);
    expect(rollA).toBeLessThanOrEqual(100);
  });

  it("verifies rolls correctly", () => {
    const ctx = {
      game: "dice" as const,
      userId: "user1",
      serverSeed: "server-seed-2",
      serverSeedHash: service.hashServerSeed("server-seed-2"),
      clientSeed: "client-seed-2",
      nonce: 0,
    };

    const roll = service.rollInt(ctx, 3, 1, 10);
    const valid = service.verifyRoll({
      serverSeed: ctx.serverSeed,
      clientSeed: ctx.clientSeed,
      nonce: 3,
      expected: roll,
      min: 1,
      max: 10,
    });

    expect(valid).toBe(true);
  });
});
