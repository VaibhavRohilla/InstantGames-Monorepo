"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvablyFairRngService = exports.RNG_SERVICE = void 0;
exports.RNG_SERVICE = Symbol("RNG_SERVICE");
class ProvablyFairRngService {
    service;
    constructor(service) {
        this.service = service;
    }
    rollFloat(ctx, nonce) {
        return this.service.rollFloat(ctx, nonce);
    }
    rollInt(ctx, nonce, min, max) {
        return this.service.rollInt(ctx, nonce, min, max);
    }
}
exports.ProvablyFairRngService = ProvablyFairRngService;
