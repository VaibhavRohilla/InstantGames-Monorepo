import { GameMode } from "@instant-games/core-types";
import { IKeyValueStore, ILockManager } from "@instant-games/core-redis";
export interface IWalletPort {
    getBalance(userId: string, currency: string, mode: GameMode): Promise<bigint>;
    debitIfSufficient(userId: string, amount: bigint, currency: string, mode: GameMode, meta?: Record<string, unknown>): Promise<void>;
    credit(userId: string, amount: bigint, currency: string, mode: GameMode, meta?: Record<string, unknown>): Promise<void>;
}
export declare const DEMO_WALLET: unique symbol;
export declare const WALLET_ROUTER: unique symbol;
export declare class DemoWalletService implements IWalletPort {
    private readonly store;
    private readonly lock;
    constructor(store: IKeyValueStore, lock: ILockManager);
    getBalance(userId: string, currency: string, mode: GameMode): Promise<bigint>;
    debitIfSufficient(userId: string, amount: bigint, currency: string, mode: GameMode): Promise<void>;
    credit(userId: string, amount: bigint, currency: string, mode: GameMode): Promise<void>;
}
export declare class WalletRouter {
    private readonly demoWallet;
    private readonly realWallet?;
    constructor(demoWallet: IWalletPort, realWallet?: IWalletPort | undefined);
    resolve(mode: GameMode): IWalletPort;
}
