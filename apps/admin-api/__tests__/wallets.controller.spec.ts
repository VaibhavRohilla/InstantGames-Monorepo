import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletsController } from "../src/controllers/wallets.controller";
import { WalletsService } from "../src/services/wallets.service";

describe("WalletsController", () => {
  const serviceMock = {
    search: vi.fn().mockResolvedValue([]),
    getBalance: vi.fn().mockResolvedValue({ operatorId: "op", userId: "user", currency: "USD", mode: "demo", balance: "0", createdAt: null, updatedAt: null }),
  };
  let controller: WalletsController;

  beforeEach(async () => {
    controller = new WalletsController(serviceMock as unknown as WalletsService);
    serviceMock.search.mockClear();
    serviceMock.getBalance.mockClear();
  });

  it("delegates to wallets service for list", async () => {
    await controller.list({ operatorId: "op", userId: "user" });
    expect(serviceMock.search).toHaveBeenCalledWith({ operatorId: "op", userId: "user", currency: undefined, mode: undefined });
  });

  it("delegates to service for single wallet", async () => {
    await controller.getWallet("op", "user", "USD", "demo");
    expect(serviceMock.getBalance).toHaveBeenCalledWith("op", "user", "USD", "demo");
  });
});

