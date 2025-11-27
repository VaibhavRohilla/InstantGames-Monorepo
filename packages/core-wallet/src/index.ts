import { GameMode } from "@instant-games/core-types";
import { IKeyValueStore, ILockManager } from "@instant-games/core-redis";

export interface IWalletPort {
  getBalance(userId: string, currency: string, mode: GameMode): Promise<bigint>;
  debitIfSufficient(userId: string, amount: bigint, currency: string, mode: GameMode, meta?: Record<string, unknown>): Promise<void>;
  credit(userId: string, amount: bigint, currency: string, mode: GameMode, meta?: Record<string, unknown>): Promise<void>;
}

export const DEMO_WALLET = Symbol("DEMO_WALLET");
export const WALLET_ROUTER = Symbol("WALLET_ROUTER");

const WALLET_KEY = (userId: string, currency: string, mode: GameMode) => `wallet:${mode}:${currency}:${userId}`;

export class DemoWalletService implements IWalletPort {
  constructor(private readonly store: IKeyValueStore, private readonly lock: ILockManager) {}

  async getBalance(userId: string, currency: string, mode: GameMode): Promise<bigint> {
    const key = WALLET_KEY(userId, currency, mode);
    const record = await this.store.get<{ balance: string }>(key);
    return record ? BigInt(record.balance) : BigInt(0);
  }

  async debitIfSufficient(userId: string, amount: bigint, currency: string, mode: GameMode): Promise<void> {
    const key = WALLET_KEY(userId, currency, mode);
    await this.lock.withLock(`wallet:lock:${key}`, 2000, async () => {
      const record = (await this.store.get<{ balance: string }>(key)) ?? { balance: "0" };
      const balance = BigInt(record.balance);
      if (balance < amount) {
        throw new Error("INSUFFICIENT_FUNDS");
      }
      const next = (balance - amount).toString();
      await this.store.set(key, { balance: next });
    });
  }

  async credit(userId: string, amount: bigint, currency: string, mode: GameMode): Promise<void> {
    const key = WALLET_KEY(userId, currency, mode);
    await this.lock.withLock(`wallet:lock:${key}`, 2000, async () => {
      const record = (await this.store.get<{ balance: string }>(key)) ?? { balance: "0" };
      const balance = BigInt(record.balance);
      const next = (balance + amount).toString();
      await this.store.set(key, { balance: next });
    });
  }
}

export class WalletRouter {
  constructor(private readonly demoWallet: IWalletPort, private readonly realWallet?: IWalletPort) {}

  resolve(mode: GameMode): IWalletPort {
    if (mode === "demo") return this.demoWallet;
    if (!this.realWallet) {
      throw new Error("Real-money wallet adapter not configured");
    }
    return this.realWallet;
  }
}
