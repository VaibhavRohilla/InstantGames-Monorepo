import { describe, expect, it } from "vitest";
import { DemoWalletService } from "@instant-games/core-wallet";
import { IKeyValueStore, ILockManager } from "@instant-games/core-redis";

class MemoryStore implements IKeyValueStore {
  private readonly store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class NoopLock implements ILockManager {
  async withLock<T>(_key: string, _ttlMs: number, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

describe("DemoWalletService", () => {
  it("tracks balances for credit/debit", async () => {
    const wallet = new DemoWalletService(new MemoryStore(), new NoopLock());
    const userId = "user-1";

    await wallet.credit(userId, BigInt(500), "USD", "demo");
    let balance = await wallet.getBalance(userId, "USD", "demo");
    expect(balance).toBe(BigInt(500));

    await wallet.debitIfSufficient(userId, BigInt(200), "USD", "demo");
    balance = await wallet.getBalance(userId, "USD", "demo");
    expect(balance).toBe(BigInt(300));
  });
});
