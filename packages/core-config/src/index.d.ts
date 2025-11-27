import { AuthContext } from "@instant-games/core-auth";
import { GameMode, GameName } from "@instant-games/core-types";
import { IDbClient } from "@instant-games/core-db";
import { IKeyValueStore } from "@instant-games/core-redis";
export interface GameConfig {
    game: GameName;
    operatorId: string;
    currency: string;
    mode: GameMode;
    minBet: bigint;
    maxBet: bigint;
    maxPayoutPerRound: bigint;
    volatilityProfile?: "low" | "medium" | "high";
    mathVersion: string;
    demoEnabled: boolean;
    realEnabled: boolean;
    features: Record<string, boolean>;
    extra: Record<string, unknown>;
}
export interface IGameConfigService {
    getConfig(params: {
        ctx: AuthContext;
        game: GameName;
    }): Promise<GameConfig>;
}
export declare const GAME_CONFIG_SERVICE: unique symbol;
export declare class DbGameConfigService implements IGameConfigService {
    private readonly db;
    private readonly cache;
    private readonly ttlSeconds;
    constructor(db: IDbClient, cache: IKeyValueStore, ttlSeconds?: number);
    getConfig(params: {
        ctx: AuthContext;
        game: GameName;
    }): Promise<GameConfig>;
}
