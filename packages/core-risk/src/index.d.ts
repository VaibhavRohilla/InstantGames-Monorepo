import { AuthContext } from "@instant-games/core-auth";
import { GameName } from "@instant-games/core-types";
import { IGameConfigService } from "@instant-games/core-config";
import { IKeyValueStore } from "@instant-games/core-redis";
export interface IRiskService {
    validateBet(params: {
        ctx: AuthContext;
        game: GameName;
        betAmount: bigint;
        potentialPayout: bigint;
    }): Promise<void>;
}
export declare const RISK_SERVICE: unique symbol;
export declare class RiskViolationError extends Error {
    constructor(message: string);
}
export declare class RiskService implements IRiskService {
    private readonly configService;
    private readonly store;
    constructor(configService: IGameConfigService, store: IKeyValueStore);
    validateBet(params: {
        ctx: AuthContext;
        game: GameName;
        betAmount: bigint;
        potentialPayout: bigint;
    }): Promise<void>;
    private enforceRateLimit;
}
