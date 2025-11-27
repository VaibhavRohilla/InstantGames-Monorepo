import { describe, expect, it } from "vitest";
import { DemoWalletService, scopeWalletUserId } from "../src";
import { IKeyValueStore, ILockManager, serializeForRedis, deserializeFromRedis } from "@instant-games/core-redis";

class MemoryStore implements IKeyValueStore {
  private readonly store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    return deserializeFromRedis<T>(this.store.get(key) ?? null);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, serializeForRedis(value));
  }

  async setNx(key: string, value: string, _ttlSeconds?: number): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, serializeForRedis(value));
    return true;
  }

  async incr(key: string, _ttlSeconds?: number): Promise<number> {
    const next = Number(this.store.get(key) ?? "0") + 1;
    this.store.set(key, next.toString());
    return next;
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
    const userId = scopeWalletUserId("op-a", "user-1");

    await wallet.credit(userId, BigInt(500), "USD", "demo");
    let balance = await wallet.getBalance(userId, "USD", "demo");
    expect(balance).toBe(BigInt(500));

    await wallet.debitIfSufficient(userId, BigInt(200), "USD", "demo");
    balance = await wallet.getBalance(userId, "USD", "demo");
    expect(balance).toBe(BigInt(300));
  });

  it("isolates balances per operator", async () => {
    const wallet = new DemoWalletService(new MemoryStore(), new NoopLock());
    const user = "user-1";
    const opAUser = scopeWalletUserId("op-a", user);
    const opBUser = scopeWalletUserId("op-b", user);

    await wallet.credit(opAUser, BigInt(100), "USD", "demo");
    await wallet.credit(opBUser, BigInt(200), "USD", "demo");

    const balanceA = await wallet.getBalance(opAUser, "USD", "demo");
    const balanceB = await wallet.getBalance(opBUser, "USD", "demo");

    expect(balanceA).toBe(BigInt(100));
    expect(balanceB).toBe(BigInt(200));
  });
});
