import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { PfController } from "../src/controllers/pf.controller";
import { PF_ROTATION_SERVICE } from "@instant-games/core-provably-fair";

describe("PfController", () => {
  const rotationMock = {
    getSeedHistory: vi.fn().mockResolvedValue([]),
    rotateServerSeed: vi.fn().mockResolvedValue({ id: "seed-1", serverSeedHash: "hash", createdAt: new Date(), rotatedAt: null, active: true, operatorId: "op", game: "dice", mode: "demo", serverSeed: "seed" }),
  };
  let controller: PfController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PfController],
      providers: [{ provide: PF_ROTATION_SERVICE, useValue: rotationMock }],
    }).compile();
    controller = moduleRef.get(PfController);
    rotationMock.getSeedHistory.mockClear();
    rotationMock.rotateServerSeed.mockClear();
  });

  it("fetches seed history", async () => {
    await controller.listSeeds({ operatorId: "op", game: "dice", mode: "demo", limit: 5 });
    expect(rotationMock.getSeedHistory).toHaveBeenCalledWith({
      operatorId: "op",
      game: "dice",
      mode: "demo",
      limit: 5,
    });
  });

  it("rotates seeds", async () => {
    await controller.rotate({ operatorId: "op", game: "dice", mode: "demo" });
    expect(rotationMock.rotateServerSeed).toHaveBeenCalled();
  });
});

