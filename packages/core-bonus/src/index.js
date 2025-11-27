"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoopBonusPort = exports.BONUS_PORT = void 0;
exports.BONUS_PORT = Symbol("BONUS_PORT");
class NoopBonusPort {
    async onRoundSettled() {
        return Promise.resolve();
    }
}
exports.NoopBonusPort = NoopBonusPort;
