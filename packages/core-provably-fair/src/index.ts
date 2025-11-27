import { randomBytes, createHmac, createHash } from "crypto";
import { GameMode, GameName } from "@instant-games/core-types";
import { IDbClient } from "@instant-games/core-db";
import { IKeyValueStore } from "@instant-games/core-redis";

export interface ProvablyFairContext {
  game: GameName;
  userId: string;
  serverSeedId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface PfSeedHistory {
  id: string;
  serverSeedHash: string;
  serverSeed: string | null;
  createdAt: Date;
  rotatedAt: Date | null;
  active: boolean;
}

export interface PfServerSeedRecord {
  id: string;
  operatorId: string;
  game: GameName;
  mode: GameMode;
  serverSeed: string;
  serverSeedHash: string;
  createdAt: Date;
  rotatedAt: Date | null;
  active: boolean;
}

export interface IProvablyFairService {
  generateServerSeed(): Promise<string>;
  hashServerSeed(serverSeed: string): string;
  initContext(params: { userId: string; game: GameName; clientSeed?: string }): Promise<ProvablyFairContext>;
  rollFloat(ctx: ProvablyFairContext, nonce: number): number;
  rollInt(ctx: ProvablyFairContext, nonce: number, min: number, max: number): number;
  verifyRoll(params: {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    expected: number;
    min: number;
    max: number;
  }): boolean;
}

export interface IProvablyFairStateStore {
  getOrInitContext(params: { operatorId: string; mode: GameMode; userId: string; game: GameName; clientSeed?: string }): Promise<ProvablyFairContext>;
  nextNonce(params: { operatorId: string; mode: GameMode; userId: string; game: GameName }): Promise<number>;
  revealServerSeed(params: { operatorId: string; mode: GameMode; userId: string; game: GameName }): Promise<string | null>;
}

export const PROVABLY_FAIR_SERVICE = Symbol("PROVABLY_FAIR_SERVICE");
export const PROVABLY_FAIR_STATE_STORE = Symbol("PROVABLY_FAIR_STATE_STORE");
export const PF_ROTATION_SERVICE = Symbol("PF_ROTATION_SERVICE");

export interface IPfRotationService {
  getActiveSeed(params: { operatorId: string; game: GameName; mode: GameMode }): Promise<PfServerSeedRecord>;
  rotateServerSeed(params: { operatorId: string; game: GameName; mode: GameMode }): Promise<PfServerSeedRecord>;
  getSeedHistory(params: { operatorId: string; game: GameName; mode: GameMode; limit?: number }): Promise<PfSeedHistory[]>;
}

export class ProvablyFairService implements IProvablyFairService {
  async generateServerSeed(): Promise<string> {
    return randomBytes(32).toString("hex");
  }

  hashServerSeed(serverSeed: string): string {
    return createHash("sha256").update(serverSeed).digest("hex");
  }

  async initContext(params: { userId: string; game: GameName; clientSeed?: string }): Promise<ProvablyFairContext> {
    const serverSeed = await this.generateServerSeed();
    const serverSeedHash = this.hashServerSeed(serverSeed);
    return {
      userId: params.userId,
      game: params.game,
      serverSeedId: "ephemeral",
      serverSeed,
      serverSeedHash,
      clientSeed: params.clientSeed ?? randomBytes(16).toString("hex"),
      nonce: 0,
    };
  }

  rollFloat(ctx: ProvablyFairContext, nonce: number): number {
    const payload = `${ctx.clientSeed}:${nonce}`;
    const digest = createHmac("sha256", ctx.serverSeed).update(payload).digest("hex");
    const slice = digest.slice(0, 13);
    const decimal = parseInt(slice, 16);
    const max = Math.pow(16, slice.length);
    return decimal / max;
  }

  rollInt(ctx: ProvablyFairContext, nonce: number, min: number, max: number): number {
    if (max <= min) throw new Error("Invalid rollInt bounds");
    const span = max - min + 1;
    const float = this.rollFloat(ctx, nonce);
    return min + Math.floor(float * span);
  }

  verifyRoll(params: { serverSeed: string; clientSeed: string; nonce: number; expected: number; min: number; max: number }): boolean {
    const ctx: ProvablyFairContext = {
      game: "dice", // placeholder, not used in deterministic roll
      userId: "verify",
      serverSeedId: "verify",
      serverSeed: params.serverSeed,
      serverSeedHash: this.hashServerSeed(params.serverSeed),
      clientSeed: params.clientSeed,
      nonce: params.nonce,
    };
    const actual = this.rollInt(ctx, params.nonce, params.min, params.max);
    return actual === params.expected;
  }
}

const ACTIVE_SEED_QUERY = `SELECT * FROM pf_server_seeds WHERE operator_id = $1 AND game = $2 AND mode = $3 AND active = TRUE ORDER BY created_at DESC LIMIT 1`;
const SEED_HISTORY_QUERY = `SELECT * FROM pf_server_seeds WHERE operator_id = $1 AND game = $2 AND mode = $3 ORDER BY created_at DESC LIMIT $4`;
const UNIQUE_VIOLATION = "23505";

export class PfRotationService implements IPfRotationService {
  constructor(private readonly db: IDbClient, private readonly pfService: IProvablyFairService) {}

  async getActiveSeed(params: { operatorId: string; game: GameName; mode: GameMode }): Promise<PfServerSeedRecord> {
    const rows = await this.db.query<SeedRow>(ACTIVE_SEED_QUERY, [params.operatorId, params.game, params.mode]);
    if (rows.length) {
      return mapSeedRow(rows[0]);
    }
    return this.createSeed(params);
  }

  async rotateServerSeed(params: { operatorId: string; game: GameName; mode: GameMode }): Promise<PfServerSeedRecord> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE pf_server_seeds SET active = FALSE, rotated_at = NOW() WHERE operator_id = $1 AND game = $2 AND mode = $3 AND active = TRUE`,
        [params.operatorId, params.game, params.mode]
      );
      return this.insertSeed(tx, params);
    });
  }

  async getSeedHistory(params: { operatorId: string; game: GameName; mode: GameMode; limit?: number }): Promise<PfSeedHistory[]> {
    const rows = await this.db.query<SeedRow>(SEED_HISTORY_QUERY, [
      params.operatorId,
      params.game,
      params.mode,
      params.limit ?? 25,
    ]);
    return rows.map((row) => {
      const record = mapSeedRow(row);
      return {
        id: record.id,
        serverSeedHash: record.serverSeedHash,
        serverSeed: record.active ? null : record.serverSeed,
        createdAt: record.createdAt,
        rotatedAt: record.rotatedAt,
        active: record.active,
      };
    });
  }

  private async createSeed(params: { operatorId: string; game: GameName; mode: GameMode }): Promise<PfServerSeedRecord> {
    try {
      return await this.insertSeed(this.db, params);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const rows = await this.db.query<SeedRow>(ACTIVE_SEED_QUERY, [params.operatorId, params.game, params.mode]);
        if (rows.length) {
          return mapSeedRow(rows[0]);
        }
      }
      throw err;
    }
  }

  private async insertSeed(client: IDbClient, params: { operatorId: string; game: GameName; mode: GameMode }): Promise<PfServerSeedRecord> {
    const serverSeed = await this.pfService.generateServerSeed();
    const serverSeedHash = this.pfService.hashServerSeed(serverSeed);
    const rows = await client.query<SeedRow>(
      `INSERT INTO pf_server_seeds (id, operator_id, game, mode, server_seed, server_seed_hash, active)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,TRUE)
       RETURNING *`,
      [params.operatorId, params.game, params.mode, serverSeed, serverSeedHash]
    );
    return mapSeedRow(rows[0]);
  }
}

const CONTEXT_KEY = (operatorId: string, mode: GameMode, game: GameName, userId: string) =>
  `pf:ctx:${operatorId}:${mode}:${game}:${userId}`;
const NONCE_KEY = (operatorId: string, mode: GameMode, game: GameName, userId: string) =>
  `pf:nonce:${operatorId}:${mode}:${game}:${userId}`;

export class RedisProvablyFairStateStore implements IProvablyFairStateStore {
  constructor(private readonly kv: IKeyValueStore, private readonly rotationService: IPfRotationService, private readonly ttlSeconds = 60 * 60 * 24) {}

  async getOrInitContext(params: { operatorId: string; mode: GameMode; userId: string; game: GameName; clientSeed?: string }): Promise<ProvablyFairContext> {
    const { operatorId, mode, userId, game, clientSeed } = params;
    const key = CONTEXT_KEY(operatorId, mode, game, userId);
    const activeSeed = await this.rotationService.getActiveSeed({ operatorId, game, mode });
    const existing = await this.kv.get<ProvablyFairContext>(key);

    if (existing && existing.serverSeedId === activeSeed.id) {
      let updated = existing;
      if (clientSeed && existing.clientSeed !== clientSeed) {
        updated = { ...existing, clientSeed, nonce: 0 };
        await this.kv.del(NONCE_KEY(operatorId, mode, game, userId));
      }
      await this.kv.set(key, updated, this.ttlSeconds);
      return updated;
    }

    const newContext: ProvablyFairContext = {
      game,
      userId,
      serverSeedId: activeSeed.id,
      serverSeed: activeSeed.serverSeed,
      serverSeedHash: activeSeed.serverSeedHash,
      clientSeed: clientSeed ?? randomBytes(16).toString("hex"),
      nonce: 0,
    };
    await this.kv.set(key, newContext, this.ttlSeconds);
    await this.kv.del(NONCE_KEY(operatorId, mode, game, userId));
    return newContext;
  }

  async nextNonce(params: { operatorId: string; mode: GameMode; userId: string; game: GameName }): Promise<number> {
    const { operatorId, mode, userId, game } = params;
    const key = NONCE_KEY(operatorId, mode, game, userId);
    const next = await this.kv.incr(key, this.ttlSeconds);
    return next;
  }

  async revealServerSeed(params: { operatorId: string; mode: GameMode; userId: string; game: GameName }): Promise<string | null> {
    const { operatorId, mode, userId, game } = params;
    const ctx = await this.kv.get<ProvablyFairContext>(CONTEXT_KEY(operatorId, mode, game, userId));
    return ctx?.serverSeed ?? null;
  }
}

interface SeedRow {
  id: string;
  operator_id: string;
  game: GameName;
  mode: GameMode;
  server_seed: string;
  server_seed_hash: string;
  created_at: string;
  rotated_at: string | null;
  active: boolean;
}

function mapSeedRow(row: SeedRow): PfServerSeedRecord {
  return {
    id: row.id,
    operatorId: row.operator_id,
    game: row.game,
    mode: row.mode,
    serverSeed: row.server_seed,
    serverSeedHash: row.server_seed_hash,
    createdAt: new Date(row.created_at),
    rotatedAt: row.rotated_at ? new Date(row.rotated_at) : null,
    active: row.active,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === UNIQUE_VIOLATION);
}
