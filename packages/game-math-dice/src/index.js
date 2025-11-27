"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiceMathEngine = void 0;
class DiceMathEngine {
    config;
    constructor(config) {
        this.config = config;
    }
    evaluate(betAmount, bet, rolled) {
        this.validateBet(bet);
        const multiplier = this.computeMultiplier(bet);
        const win = this.didPlayerWin(bet, rolled);
        const payout = win ? BigInt(Math.floor(Number(betAmount) * multiplier)) : BigInt(0);
        return {
            rolled,
            win,
            multiplier,
            payout,
        };
    }
    estimateMaxPayout(betAmount, bet) {
        const multiplier = this.computeMultiplier(bet);
        return BigInt(Math.floor(Number(betAmount) * multiplier));
    }
    validateBet(bet) {
        if (bet.target < this.config.minTarget || bet.target > this.config.maxTarget) {
            throw new Error("INVALID_TARGET");
        }
    }
    didPlayerWin(bet, rolled) {
        if (bet.condition === "over") {
            return rolled > bet.target;
        }
        return rolled < bet.target;
    }
    computeMultiplier(bet) {
        const probability = bet.condition === "over" ? (100 - bet.target) / 100 : bet.target / 100;
        if (probability <= 0) {
            throw new Error("INVALID_PROBABILITY");
        }
        const edgeFactor = 1 - this.config.houseEdge / 100;
        let multiplier = edgeFactor / probability;
        if (this.config.maxMultiplier) {
            multiplier = Math.min(multiplier, this.config.maxMultiplier);
        }
        return Number(multiplier.toFixed(4));
    }
}
exports.DiceMathEngine = DiceMathEngine;
