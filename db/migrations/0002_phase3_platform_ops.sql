CREATE TABLE IF NOT EXISTS wallet_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id TEXT NOT NULL REFERENCES operators(id),
    user_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    mode TEXT NOT NULL,
    balance NUMERIC(36, 0) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (operator_id, user_id, currency, mode)
);

CREATE INDEX IF NOT EXISTS idx_wallet_balances_lookup
    ON wallet_balances (operator_id, user_id, currency, mode);

CREATE TABLE IF NOT EXISTS pf_server_seeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id TEXT NOT NULL REFERENCES operators(id),
    game TEXT NOT NULL,
    mode TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pf_seeds_lookup
    ON pf_server_seeds (operator_id, game, mode, active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pf_active_seed_unique
    ON pf_server_seeds (operator_id, game, mode)
    WHERE active = TRUE;

