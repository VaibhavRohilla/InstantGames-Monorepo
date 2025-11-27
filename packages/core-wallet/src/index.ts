import { GameMode } from "@instant-games/core-types";
import { IKeyValueStore, ILockManager } from "@instant-games/core-redis";

export interface IWalletPort {
  getBalance(userId: string, currency: string, mode: GameMode): Promise<bigint>;
  debitIfSufficient(userId: string, amount: bigint, currency: string, mode: GameMode, meta?: Record<string, unknown>): Promise<void>;
  credit(userId: string, amount: bigint, currency: string, mode: GameMode, meta?: Record<string, unknown>): Promise<void>;
}

export const DEMO_WALLET = Symbol("DEMO_WALLET");
export const WALLET_ROUTER = Symbol("WALLET_ROUTER");

const OPERATOR_USER_DELIMITER = "::";
const DEFAULT_OPERATOR = "global";

const WALLET_KEY = (operatorId: string, userId: string, currency: string, mode: GameMode) =>
  `wallet:${operatorId}:${mode}:${currency}:${userId}`;
const WALLET_LOCK_KEY = (operatorId: string, userId: string, currency: string, mode: GameMode) =>
  `wallet:lock:${operatorId}:${mode}:${currency}:${userId}`;

function parseScopedUserId(rawUserId: string): { operatorId: string; userId: string } {
  if (!rawUserId.includes(OPERATOR_USER_DELIMITER)) {
    return { operatorId: DEFAULT_OPERATOR, userId: rawUserId };
  }
  const [operatorId, ...rest] = rawUserId.split(OPERATOR_USER_DELIMITER);
  const userId = rest.join(OPERATOR_USER_DELIMITER);
  return { operatorId: operatorId || DEFAULT_OPERATOR, userId };
}

export function scopeWalletUserId(operatorId: string, userId: string): string {
  return `${operatorId}${OPERATOR_USER_DELIMITER}${userId}`;
}

export class DemoWalletService implements IWalletPort {
  constructor(private readonly store: IKeyValueStore, private readonly lock: ILockManager) {}

  async getBalance(userId: string, currency: string, mode: GameMode): Promise<bigint> {
    const scoped = parseScopedUserId(userId);
    const key = WALLET_KEY(scoped.operatorId, scoped.userId, currency, mode);
    const record = await this.store.get<{ balance: string }>(key);
    return record ? BigInt(record.balance) : BigInt(0);
  }

  async debitIfSufficient(userId: string, amount: bigint, currency: string, mode: GameMode): Promise<void> {
    const scoped = parseScopedUserId(userId);
    const key = WALLET_KEY(scoped.operatorId, scoped.userId, currency, mode);
    await this.lock.withLock(WALLET_LOCK_KEY(scoped.operatorId, scoped.userId, currency, mode), 2000, async () => {
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
    const scoped = parseScopedUserId(userId);
    const key = WALLET_KEY(scoped.operatorId, scoped.userId, currency, mode);
    await this.lock.withLock(WALLET_LOCK_KEY(scoped.operatorId, scoped.userId, currency, mode), 2000, async () => {
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

// TODO: Replace demo Redis wallet with a DB-backed wallet implementation for production.
