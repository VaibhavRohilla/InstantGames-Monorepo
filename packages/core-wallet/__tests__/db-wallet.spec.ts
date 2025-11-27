import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { newDb, DataType } from "pg-mem";
import { DbWalletService, scopeWalletUserId } from "../src";
import { IDbClient } from "@instant-games/core-db";
import { ILockManager } from "@instant-games/core-redis";

class InMemoryLockManager implements ILockManager {
  private locks = new Set<string>();

  async withLock<T>(key: string, _ttlMs: number, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    this.locks.add(key);
    try {
      return await fn();
    } finally {
      this.locks.delete(key);
    }
  }
}

async function createDb(): Promise<IDbClient> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: "now",
    returns: DataType.timestamptz,
    implementation: () => new Date(),
  });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => randomUUID(),
  });
  db.public.none(`
    CREATE TABLE operators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);
  db.public.none(`
    CREATE TABLE wallet_balances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id TEXT NOT NULL REFERENCES operators(id),
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      mode TEXT NOT NULL,
      balance NUMERIC(36, 0) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (operator_id, user_id, currency, mode)
    );
  `);
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();

  return {
    async query<T = any>(sql: string, params: any[] = []) {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },
    async transaction<T>(fn: (tx: IDbClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txClient: IDbClient = {
          query: async (sql: string, params: any[] = []) => {
            const res = await client.query(sql, params);
            return res.rows as any[];
          },
          transaction: () => Promise.reject(new Error("Nested transactions are not supported")),
        };
        const result = await fn(txClient);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

describe("DbWalletService", () => {
  let db: IDbClient;
  let wallet: DbWalletService;
  const operatorId = "op-wallet";
  const userId = "user-1";
  const currency = "USD";

  beforeEach(async () => {
    db = await createDb();
    await db.query(`INSERT INTO operators (id, name) VALUES ($1, $2)`, [operatorId, "Wallet Operator"]);
    wallet = new DbWalletService(db, new InMemoryLockManager());
  });

  it("credits and debits balances", async () => {
    const scoped = scopeWalletUserId(operatorId, userId);
    await wallet.credit(scoped, BigInt(500), currency, "real");
    expect(await wallet.getBalance(scoped, currency, "real")).toBe(BigInt(500));

    await wallet.debitIfSufficient(scoped, BigInt(200), currency, "real");
    expect(await wallet.getBalance(scoped, currency, "real")).toBe(BigInt(300));
  });

  it("rejects insufficient funds", async () => {
    const scoped = scopeWalletUserId(operatorId, userId);
    await expect(wallet.debitIfSufficient(scoped, BigInt(1), currency, "real")).rejects.toThrowError("INSUFFICIENT_FUNDS");
  });

  it("prevents concurrent overdrafts", async () => {
    const scoped = scopeWalletUserId(operatorId, userId);
    await wallet.credit(scoped, BigInt(500), currency, "real");

    const [resultA, resultB] = await Promise.allSettled([
      wallet.debitIfSufficient(scoped, BigInt(400), currency, "real"),
      wallet.debitIfSufficient(scoped, BigInt(400), currency, "real"),
    ]);

    const failures = [resultA, resultB].filter((result) => result.status === "rejected");
    expect(failures.length).toBe(1);
    expect(await wallet.getBalance(scoped, currency, "real")).toBe(BigInt(100));
  });

  it("lazily creates balance rows once", async () => {
    const scoped = scopeWalletUserId(operatorId, userId);
    await Promise.all([
      wallet.getBalance(scoped, currency, "real"),
      wallet.getBalance(scoped, currency, "real"),
    ]);

    const rows = await db.query(
      `SELECT * FROM wallet_balances WHERE operator_id = $1 AND user_id = $2 AND currency = $3 AND mode = $4`,
      [operatorId, userId, currency, "real"]
    );
    expect(rows).toHaveLength(1);
    expect(BigInt(rows[0].balance)).toBe(BigInt(0));
  });
});

