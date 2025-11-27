import { AuthContext } from "@instant-games/core-auth";
import { GameMode, GameName } from "@instant-games/core-types";

export interface IBonusPort {
  onRoundSettled(params: { ctx: AuthContext; game: GameName; roundId: string; betAmount: bigint; payoutAmount: bigint; mode: GameMode }): Promise<void>;
}

export const BONUS_PORT = Symbol("BONUS_PORT");

export class NoopBonusPort implements IBonusPort {
  async onRoundSettled(): Promise<void> {
    return Promise.resolve();
  }
}
