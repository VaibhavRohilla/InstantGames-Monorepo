import { GameMode } from "@instant-games/core-types";
import { IDbClient } from "@instant-games/core-db";
import { IKeyValueStore, ILockManager } from "@instant-games/core-redis";

export interface IWalletPort {
  getBalance(userId: string, currency: string, mode: GameMode): Promise<bigint>;
  debitIfSufficient(userId: string, amount: bigint, currency: string, mode: GameMode, meta?: Record<string, unknown>): Promise<void>;
  credit(userId: string, amount: bigint, currency: string, mode: GameMode, meta?: Record<string, unknown>): Promise<void>;
}

export const DEMO_WALLET = Symbol("DEMO_WALLET");
export const DB_WALLET = Symbol("DB_WALLET");
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

export class DbWalletService implements IWalletPort {
  private readonly lockTtlMs: number;

  constructor(private readonly db: IDbClient, private readonly lock: ILockManager, lockTtlMs = 2000) {
    this.lockTtlMs = lockTtlMs;
  }

  async getBalance(userId: string, currency: string, mode: GameMode): Promise<bigint> {
    const scoped = parseScopedUserId(userId);
    const row = await this.findBalance(scoped.operatorId, scoped.userId, currency, mode);
    if (row) {
      return BigInt(row.balance);
    }
    await this.ensureBalanceRow(scoped.operatorId, scoped.userId, currency, mode);
    return BigInt(0);
  }

  async debitIfSufficient(userId: string, amount: bigint, currency: string, mode: GameMode): Promise<void> {
    const scoped = parseScopedUserId(userId);
    const lockKey = WALLET_LOCK_KEY(scoped.operatorId, scoped.userId, currency, mode);
    await this.lock.withLock(lockKey, this.lockTtlMs, async () => {
      await this.db.transaction(async (tx) => {
        const row = await this.findOrCreateForUpdate(tx, scoped.operatorId, scoped.userId, currency, mode);
        const balance = BigInt(row.balance);
        if (balance < amount) {
          throw new Error("INSUFFICIENT_FUNDS");
        }
        const next = (balance - amount).toString();
        await tx.query(
          `UPDATE wallet_balances SET balance = $1, updated_at = NOW() WHERE id = $2`,
          [next, row.id]
        );
      });
    });
  }

  async credit(userId: string, amount: bigint, currency: string, mode: GameMode): Promise<void> {
    const scoped = parseScopedUserId(userId);
    const lockKey = WALLET_LOCK_KEY(scoped.operatorId, scoped.userId, currency, mode);
    await this.lock.withLock(lockKey, this.lockTtlMs, async () => {
      await this.db.transaction(async (tx) => {
        const row = await this.findOrCreateForUpdate(tx, scoped.operatorId, scoped.userId, currency, mode);
        const balance = BigInt(row.balance);
        const next = (balance + amount).toString();
        await tx.query(
          `UPDATE wallet_balances SET balance = $1, updated_at = NOW() WHERE id = $2`,
          [next, row.id]
        );
      });
    });
  }

  private async findBalance(operatorId: string, userId: string, currency: string, mode: GameMode) {
    const rows = await this.db.query<WalletBalanceRow>(
      `SELECT id, operator_id, user_id, currency, mode, balance
       FROM wallet_balances
       WHERE operator_id = $1 AND user_id = $2 AND currency = $3 AND mode = $4`,
      [operatorId, userId, currency, mode]
    );
    return rows[0] ?? null;
  }

  private async ensureBalanceRow(operatorId: string, userId: string, currency: string, mode: GameMode): Promise<void> {
    await this.db.query(
      `INSERT INTO wallet_balances (operator_id, user_id, currency, mode, balance)
       VALUES ($1,$2,$3,$4,0)
       ON CONFLICT (operator_id, user_id, currency, mode) DO NOTHING`,
      [operatorId, userId, currency, mode]
    );
  }

  private async findOrCreateForUpdate(tx: IDbClient, operatorId: string, userId: string, currency: string, mode: GameMode) {
    const rows = await tx.query<WalletBalanceRow>(
      `SELECT id, operator_id, user_id, currency, mode, balance
       FROM wallet_balances
       WHERE operator_id = $1 AND user_id = $2 AND currency = $3 AND mode = $4
       FOR UPDATE`,
      [operatorId, userId, currency, mode]
    );
    if (rows.length) {
      return rows[0];
    }
    const inserted = await tx.query<WalletBalanceRow>(
      `INSERT INTO wallet_balances (operator_id, user_id, currency, mode, balance)
       VALUES ($1,$2,$3,$4,0)
       RETURNING id, operator_id, user_id, currency, mode, balance`,
      [operatorId, userId, currency, mode]
    );
    return inserted[0];
  }
}

export interface WalletRouterOptions {
  allowDemoFallback?: boolean;
}

export class WalletRouter {
  constructor(
    private readonly demoWallet: IWalletPort,
    private readonly realWallet?: IWalletPort,
    private readonly options: WalletRouterOptions = {}
  ) {}

  resolve(mode: GameMode): IWalletPort {
    if (mode === "demo") {
      return this.demoWallet;
    }
    if (this.realWallet) {
      return this.realWallet;
    }
    if (this.options.allowDemoFallback) {
      return this.demoWallet;
    }
    throw new Error("Real-money wallet adapter not configured");
  }
}

interface WalletBalanceRow {
  id: string;
  operator_id: string;
  user_id: string;
  currency: string;
  mode: GameMode;
  balance: string;
}
