"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletTransactionRepository = exports.WALLET_TRANSACTION_REPOSITORY = void 0;
const crypto_1 = require("crypto");
exports.WALLET_TRANSACTION_REPOSITORY = Symbol("WALLET_TRANSACTION_REPOSITORY");
class WalletTransactionRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async log(tx) {
        await this.db.query(`INSERT INTO wallet_transactions (id, user_id, operator_id, mode, currency, amount, balance_before, balance_after, type, game, round_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
            tx.id || (0, crypto_1.randomUUID)(),
            tx.userId,
            tx.operatorId,
            tx.mode,
            tx.currency,
            tx.amount.toString(),
            tx.balanceBefore ? tx.balanceBefore.toString() : null,
            tx.balanceAfter ? tx.balanceAfter.toString() : null,
            tx.type,
            tx.game,
            tx.roundId,
            JSON.stringify(tx.meta ?? {}),
        ]);
    }
    async listForUser(userId, limit = 100, offset = 0) {
        const rows = await this.db.query(`SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
        return rows.map(mapRow);
    }
}
exports.WalletTransactionRepository = WalletTransactionRepository;
function mapRow(row) {
    return {
        id: row.id,
        userId: row.user_id,
        operatorId: row.operator_id,
        mode: row.mode,
        currency: row.currency,
        amount: BigInt(row.amount),
        balanceBefore: row.balance_before ? BigInt(row.balance_before) : null,
        balanceAfter: row.balance_after ? BigInt(row.balance_after) : null,
        type: row.type,
        game: row.game,
        roundId: row.round_id,
        createdAt: new Date(row.created_at),
        meta: row.meta ?? {},
    };
}
