import { randomBytes, createHmac, createHash } from "crypto";
import { GameMode, GameName } from "@instant-games/core-types";
import { IKeyValueStore } from "@instant-games/core-redis";

export interface ProvablyFairContext {
  game: GameName;
  userId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
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
      serverSeed: params.serverSeed,
      serverSeedHash: this.hashServerSeed(params.serverSeed),
      clientSeed: params.clientSeed,
      nonce: params.nonce,
    };
    const actual = this.rollInt(ctx, params.nonce, params.min, params.max);
    return actual === params.expected;
  }
}

const CONTEXT_KEY = (operatorId: string, mode: GameMode, game: GameName, userId: string) =>
  `pf:ctx:${operatorId}:${mode}:${game}:${userId}`;
const NONCE_KEY = (operatorId: string, mode: GameMode, game: GameName, userId: string) =>
  `pf:nonce:${operatorId}:${mode}:${game}:${userId}`;

export class RedisProvablyFairStateStore implements IProvablyFairStateStore {
  constructor(private readonly kv: IKeyValueStore, private readonly pfService: IProvablyFairService, private readonly ttlSeconds = 60 * 60 * 24) {}

  async getOrInitContext(params: { operatorId: string; mode: GameMode; userId: string; game: GameName; clientSeed?: string }): Promise<ProvablyFairContext> {
    const { operatorId, mode, userId, game, clientSeed } = params;
    const key = CONTEXT_KEY(operatorId, mode, game, userId);
    const existing = await this.kv.get<ProvablyFairContext>(key);
    if (existing) {
      if (clientSeed && existing.clientSeed !== clientSeed) {
        existing.clientSeed = clientSeed;
        existing.nonce = 0;
        await this.kv.set(key, existing, this.ttlSeconds);
        await this.kv.del(NONCE_KEY(operatorId, mode, game, userId));
        return existing;
      }
      await this.kv.set(key, existing, this.ttlSeconds);
      return existing;
    }

    const ctx = await this.pfService.initContext({ userId, game, clientSeed });
    await this.kv.set(key, ctx, this.ttlSeconds);
    return ctx;
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

// TODO: Expose server-seed rotation and historical reveal APIs for external verification.
