import { AuthContext } from "@instant-games/core-auth";
import { GameMode, GameName } from "@instant-games/core-types";
export interface IBonusPort {
    onRoundSettled(params: {
        ctx: AuthContext;
        game: GameName;
        roundId: string;
        betAmount: bigint;
        payoutAmount: bigint;
        mode: GameMode;
    }): Promise<void>;
}
export declare const BONUS_PORT: unique symbol;
export declare class NoopBonusPort implements IBonusPort {
    onRoundSettled(): Promise<void>;
}
