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
    initContext(params: {
        userId: string;
        game: GameName;
        clientSeed?: string;
    }): Promise<ProvablyFairContext>;
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
export declare const PROVABLY_FAIR_SERVICE: unique symbol;
export declare const PROVABLY_FAIR_STATE_STORE: unique symbol;
export declare class ProvablyFairService implements IProvablyFairService {
    generateServerSeed(): Promise<string>;
    hashServerSeed(serverSeed: string): string;
    initContext(params: {
        userId: string;
        game: GameName;
        clientSeed?: string;
    }): Promise<ProvablyFairContext>;
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
export declare class RedisProvablyFairStateStore implements IProvablyFairStateStore {
    private readonly kv;
    private readonly pfService;
    private readonly ttlSeconds;
    constructor(kv: IKeyValueStore, pfService: IProvablyFairService, ttlSeconds?: number);
    getOrInitContext(userId: string, game: GameName, clientSeed?: string): Promise<ProvablyFairContext>;
    nextNonce(userId: string, game: GameName): Promise<number>;
    revealServerSeed(userId: string, game: GameName): Promise<string | null>;
}
