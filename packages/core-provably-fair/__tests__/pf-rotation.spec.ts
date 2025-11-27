import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { newDb, DataType } from "pg-mem";
import { PfRotationService, ProvablyFairService } from "../src";
import { IDbClient } from "../../core-db/src";

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
    CREATE TABLE pf_server_seeds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id TEXT NOT NULL REFERENCES operators(id),
      game TEXT NOT NULL,
      mode TEXT NOT NULL,
      server_seed TEXT NOT NULL,
      server_seed_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rotated_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE
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
          transaction: () => Promise.reject(new Error("Nested transactions not supported")),
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

describe("PfRotationService", () => {
  let db: IDbClient;
  let service: PfRotationService;

  beforeEach(async () => {
    db = await createDb();
    await db.query(`INSERT INTO operators (id, name) VALUES ($1,$2)`, ["op-rot", "Rotation Operator"]);
    service = new PfRotationService(db, new ProvablyFairService());
  });

  it("creates an active seed when none exists", async () => {
    const seed = await service.getActiveSeed({ operatorId: "op-rot", game: "dice", mode: "demo" });
    expect(seed.serverSeedHash).toBeDefined();

    const second = await service.getActiveSeed({ operatorId: "op-rot", game: "dice", mode: "demo" });
    expect(second.id).toBe(seed.id);
  });

  it("rotates seeds and reveals previous seed in history", async () => {
    await service.getActiveSeed({ operatorId: "op-rot", game: "dice", mode: "demo" });
    await service.rotateServerSeed({ operatorId: "op-rot", game: "dice", mode: "demo" });

    const history = await service.getSeedHistory({ operatorId: "op-rot", game: "dice", mode: "demo", limit: 10 });
    expect(history.length).toBeGreaterThanOrEqual(2);
    const [current, previous] = history;
    expect(current.active).toBe(true);
    expect(current.serverSeed).toBeNull();
    expect(previous.active).toBe(false);
    expect(previous.serverSeed).not.toBeNull();
  });
});

