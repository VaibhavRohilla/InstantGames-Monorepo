"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletRouter = exports.DemoWalletService = exports.WALLET_ROUTER = exports.DEMO_WALLET = void 0;
exports.DEMO_WALLET = Symbol("DEMO_WALLET");
exports.WALLET_ROUTER = Symbol("WALLET_ROUTER");
const WALLET_KEY = (userId, currency, mode) => `wallet:${mode}:${currency}:${userId}`;
class DemoWalletService {
    store;
    lock;
    constructor(store, lock) {
        this.store = store;
        this.lock = lock;
    }
    async getBalance(userId, currency, mode) {
        const key = WALLET_KEY(userId, currency, mode);
        const record = await this.store.get(key);
        return record ? BigInt(record.balance) : BigInt(0);
    }
    async debitIfSufficient(userId, amount, currency, mode) {
        const key = WALLET_KEY(userId, currency, mode);
        await this.lock.withLock(`wallet:lock:${key}`, 2000, async () => {
            const record = (await this.store.get(key)) ?? { balance: "0" };
            const balance = BigInt(record.balance);
            if (balance < amount) {
                throw new Error("INSUFFICIENT_FUNDS");
            }
            const next = (balance - amount).toString();
            await this.store.set(key, { balance: next });
        });
    }
    async credit(userId, amount, currency, mode) {
        const key = WALLET_KEY(userId, currency, mode);
        await this.lock.withLock(`wallet:lock:${key}`, 2000, async () => {
            const record = (await this.store.get(key)) ?? { balance: "0" };
            const balance = BigInt(record.balance);
            const next = (balance + amount).toString();
            await this.store.set(key, { balance: next });
        });
    }
}
exports.DemoWalletService = DemoWalletService;
class WalletRouter {
    demoWallet;
    realWallet;
    constructor(demoWallet, realWallet) {
        this.demoWallet = demoWallet;
        this.realWallet = realWallet;
    }
    resolve(mode) {
        if (mode === "demo")
            return this.demoWallet;
        if (!this.realWallet) {
            throw new Error("Real-money wallet adapter not configured");
        }
        return this.realWallet;
    }
}
exports.WalletRouter = WalletRouter;
