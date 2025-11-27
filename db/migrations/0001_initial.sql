i aCREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS operators (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id TEXT NOT NULL REFERENCES operators(id),
    game TEXT NOT NULL,
    currency TEXT NOT NULL,
    mode TEXT NOT NULL,
    min_bet NUMERIC(36, 0) NOT NULL,
    max_bet NUMERIC(36, 0) NOT NULL,
    max_payout_per_round NUMERIC(36, 0) NOT NULL,
    volatility_profile TEXT,
    math_version TEXT NOT NULL,
    demo_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    real_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (operator_id, game, currency, mode)
);

CREATE TABLE IF NOT EXISTS game_rounds (
    id UUID PRIMARY KEY,
    game TEXT NOT NULL,
    user_id TEXT NOT NULL,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    mode TEXT NOT NULL,
    currency TEXT NOT NULL,
    bet_amount NUMERIC(36, 0) NOT NULL,
    payout_amount NUMERIC(36, 0) NOT NULL DEFAULT 0,
    math_version TEXT NOT NULL,
    status TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    server_seed TEXT,
    client_seed TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_game_rounds_user ON game_rounds (user_id, game, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_rounds_operator ON game_rounds (operator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    mode TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount NUMERIC(36, 0) NOT NULL,
    balance_before NUMERIC(36, 0),
    balance_after NUMERIC(36, 0),
    type TEXT NOT NULL,
    game TEXT NOT NULL,
    round_id UUID NOT NULL REFERENCES game_rounds(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_operator ON wallet_transactions (operator_id, created_at DESC);
