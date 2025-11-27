"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoundRepository = exports.GAME_ROUND_REPOSITORY = void 0;
const crypto_1 = require("crypto");
exports.GAME_ROUND_REPOSITORY = Symbol("GAME_ROUND_REPOSITORY");
class GameRoundRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async createPending(round) {
        const id = (0, crypto_1.randomUUID)();
        const rows = await this.db.query(`INSERT INTO game_rounds (id, game, user_id, operator_id, mode, currency, bet_amount, payout_amount, math_version, status, server_seed_hash, server_seed, client_seed, nonce, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`, [
            id,
            round.game,
            round.userId,
            round.operatorId,
            round.mode,
            round.currency,
            round.betAmount.toString(),
            "0",
            round.mathVersion,
            "PENDING",
            round.serverSeedHash,
            round.serverSeed,
            round.clientSeed,
            round.nonce,
            JSON.stringify(round.meta ?? {}),
        ]);
        return mapRow(rows[0]);
    }
    async markSettled(id, payoutAmount, metaUpdate = {}) {
        const rows = await this.db.query(`UPDATE game_rounds SET status = 'SETTLED', payout_amount = $2, settled_at = NOW(), meta = COALESCE(meta, '{}'::jsonb) || $3::jsonb WHERE id = $1 RETURNING *`, [id, payoutAmount.toString(), JSON.stringify(metaUpdate)]);
        if (!rows.length)
            throw new Error("Round not found");
        return mapRow(rows[0]);
    }
    async markCancelled(id, reason) {
        const rows = await this.db.query(`UPDATE game_rounds SET status = 'CANCELLED', meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb WHERE id = $1 RETURNING *`, [id, JSON.stringify({ cancelReason: reason })]);
        if (!rows.length)
            throw new Error("Round not found");
        return mapRow(rows[0]);
    }
    async findById(id) {
        const rows = await this.db.query(`SELECT * FROM game_rounds WHERE id = $1`, [id]);
        return rows.length ? mapRow(rows[0]) : null;
    }
    async listForUser(userId, game, limit = 50, offset = 0) {
        const params = [userId];
        let sql = `SELECT * FROM game_rounds WHERE user_id = $1`;
        if (game) {
            params.push(game);
            sql += ` AND game = $${params.length}`;
        }
        sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        const rows = await this.db.query(sql, params);
        return rows.map(mapRow);
    }
}
exports.GameRoundRepository = GameRoundRepository;
function mapRow(row) {
    return {
        id: row.id,
        game: row.game,
        userId: row.user_id,
        operatorId: row.operator_id,
        mode: row.mode,
        currency: row.currency,
        betAmount: BigInt(row.bet_amount),
        payoutAmount: BigInt(row.payout_amount),
        mathVersion: row.math_version,
        status: row.status,
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: row.nonce,
        createdAt: new Date(row.created_at),
        settledAt: row.settled_at ? new Date(row.settled_at) : null,
        meta: row.meta ?? {},
    };
}
