import { describe, expect, it } from "vitest";
import { RedisProvablyFairStateStore, IPfRotationService, PfServerSeedRecord, PfSeedHistory } from "@instant-games/core-provably-fair";
import { IKeyValueStore, serializeForRedis, deserializeFromRedis } from "@instant-games/core-redis";
import { GameMode, GameName } from "@instant-games/core-types";

class MemoryKvStore implements IKeyValueStore {
  private store = new Map<string, string>();

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

class StubRotationService implements IPfRotationService {
  private seeds = new Map<string, PfServerSeedRecord>();

  async getActiveSeed(params: { operatorId: string; game: GameName; mode: GameMode }): Promise<PfServerSeedRecord> {
    const key = this.key(params);
    const existing = this.seeds.get(key);
    if (existing) {
      return existing;
    }
    const seed: PfServerSeedRecord = {
      id: key,
      operatorId: params.operatorId,
      game: params.game,
      mode: params.mode,
      serverSeed: `seed-${key}`,
      serverSeedHash: `hash-${key}`,
      createdAt: new Date(),
      rotatedAt: null,
      active: true,
    };
    this.seeds.set(key, seed);
    return seed;
  }

  async rotateServerSeed(params: { operatorId: string; game: GameName; mode: GameMode }): Promise<PfServerSeedRecord> {
    const key = this.key(params);
    const updated: PfServerSeedRecord = {
      id: `${key}-${Date.now()}`,
      operatorId: params.operatorId,
      game: params.game,
      mode: params.mode,
      serverSeed: `seed-${Date.now()}`,
      serverSeedHash: `hash-${Date.now()}`,
      createdAt: new Date(),
      rotatedAt: null,
      active: true,
    };
    this.seeds.set(key, updated);
    return updated;
  }

  async getSeedHistory(params: { operatorId: string; game: GameName; mode: GameMode; limit?: number }): Promise<PfSeedHistory[]> {
    const key = this.key(params);
    const seed = this.seeds.get(key);
    if (!seed) {
      return [];
    }
    return [
      {
        id: seed.id,
        serverSeedHash: seed.serverSeedHash,
        serverSeed: seed.serverSeed,
        createdAt: seed.createdAt,
        rotatedAt: seed.rotatedAt,
        active: seed.active,
      },
    ];
  }

  private key(params: { operatorId: string; game: GameName; mode: GameMode }) {
    return `${params.operatorId}:${params.game}:${params.mode}`;
  }
}

describe("RedisProvablyFairStateStore", () => {
  it("isolates PF contexts per operator and mode", async () => {
    const kv = new MemoryKvStore();
    const store = new RedisProvablyFairStateStore(kv, new StubRotationService());

    const ctxA = await store.getOrInitContext({ operatorId: "opA", mode: "demo", userId: "user1", game: "dice" });
    const ctxB = await store.getOrInitContext({ operatorId: "opB", mode: "demo", userId: "user1", game: "dice" });

    expect(ctxA.serverSeedHash).not.toEqual(ctxB.serverSeedHash);
  });

  it("increments nonce atomically", async () => {
    const kv = new MemoryKvStore();
    const store = new RedisProvablyFairStateStore(kv, new StubRotationService());

    await store.getOrInitContext({ operatorId: "opA", mode: "demo", userId: "user2", game: "dice" });
    const [first, second] = await Promise.all([
      store.nextNonce({ operatorId: "opA", mode: "demo", userId: "user2", game: "dice" }),
      store.nextNonce({ operatorId: "opA", mode: "demo", userId: "user2", game: "dice" }),
    ]);

    expect(new Set([first, second]).size).toBe(2);
  });
});

