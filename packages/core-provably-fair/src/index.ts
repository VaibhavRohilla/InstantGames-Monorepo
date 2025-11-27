import { randomBytes, createHmac, createHash } from "crypto";
import { GameName } from "@instant-games/core-types";
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
  getOrInitContext(userId: string, game: GameName, clientSeed?: string): Promise<ProvablyFairContext>;
  nextNonce(userId: string, game: GameName): Promise<number>;
  revealServerSeed(userId: string, game: GameName): Promise<string | null>;
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

const CONTEXT_KEY = (userId: string, game: GameName) => `pf:ctx:${game}:${userId}`;
const NONCE_KEY = (userId: string, game: GameName) => `pf:nonce:${game}:${userId}`;

export class RedisProvablyFairStateStore implements IProvablyFairStateStore {
  constructor(private readonly kv: IKeyValueStore, private readonly pfService: IProvablyFairService, private readonly ttlSeconds = 60 * 60 * 24) {}

  async getOrInitContext(userId: string, game: GameName, clientSeed?: string): Promise<ProvablyFairContext> {
    const key = CONTEXT_KEY(userId, game);
    const existing = await this.kv.get<ProvablyFairContext>(key);
    if (existing) {
      if (clientSeed && existing.clientSeed !== clientSeed) {
        existing.clientSeed = clientSeed;
        existing.nonce = 0;
        await this.kv.set(key, existing, this.ttlSeconds);
      }
      return existing;
    }

    const ctx = await this.pfService.initContext({ userId, game, clientSeed });
    await this.kv.set(key, ctx, this.ttlSeconds);
    await this.kv.set(NONCE_KEY(userId, game), { nonce: 0 }, this.ttlSeconds);
    return ctx;
  }

  async nextNonce(userId: string, game: GameName): Promise<number> {
    const key = NONCE_KEY(userId, game);
    const record = (await this.kv.get<{ nonce: number }>(key)) ?? { nonce: 0 };
    const next = record.nonce + 1;
    await this.kv.set(key, { nonce: next }, this.ttlSeconds);
    return next;
  }

  async revealServerSeed(userId: string, game: GameName): Promise<string | null> {
    const ctx = await this.kv.get<ProvablyFairContext>(CONTEXT_KEY(userId, game));
    return ctx?.serverSeed ?? null;
  }
}
