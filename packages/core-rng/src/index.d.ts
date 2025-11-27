import { ProvablyFairContext, IProvablyFairService } from "@instant-games/core-provably-fair";
export interface IRngService {
    rollFloat(ctx: ProvablyFairContext, nonce: number): number;
    rollInt(ctx: ProvablyFairContext, nonce: number, min: number, max: number): number;
}
export declare const RNG_SERVICE: unique symbol;
export declare class ProvablyFairRngService implements IRngService {
    private readonly service;
    constructor(service: IProvablyFairService);
    rollFloat(ctx: ProvablyFairContext, nonce: number): number;
    rollInt(ctx: ProvablyFairContext, nonce: number, min: number, max: number): number;
}
