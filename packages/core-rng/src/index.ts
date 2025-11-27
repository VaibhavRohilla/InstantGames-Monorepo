import { ProvablyFairContext, IProvablyFairService } from "@instant-games/core-provably-fair";

export interface IRngService {
  rollFloat(ctx: ProvablyFairContext, nonce: number): number;
  rollInt(ctx: ProvablyFairContext, nonce: number, min: number, max: number): number;
}

export const RNG_SERVICE = Symbol("RNG_SERVICE");

export class ProvablyFairRngService implements IRngService {
  constructor(private readonly service: IProvablyFairService) {}

  rollFloat(ctx: ProvablyFairContext, nonce: number): number {
    return this.service.rollFloat(ctx, nonce);
  }

  rollInt(ctx: ProvablyFairContext, nonce: number, min: number, max: number): number {
    return this.service.rollInt(ctx, nonce, min, max);
  }
}
