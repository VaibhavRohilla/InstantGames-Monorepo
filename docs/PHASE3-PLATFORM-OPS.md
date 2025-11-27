## Phase 3 – Platform & Ops Hardening

### DB-backed Wallet
- Added `wallet_balances` table and `DbWalletService` with Redis locks + Postgres transactions for `credit`/`debit`.
- Dice API now routes demo bets to the existing Redis wallet and real-money bets to the DB wallet via `WalletRouter`.
- Tests cover concurrency, uniqueness, real-money dice bets, and refund consistency.

### Provably Fair Rotation & Reveal
- Added `pf_server_seeds` table plus `PfRotationService` to manage active seeds and historical reveals.
- `RedisProvablyFairStateStore` now fetches active seeds from Postgres, resets contexts on rotation, and tracks `serverSeedId`.
- Dice e2e exercises rotation to ensure new bets use fresh server seed hashes.

### Admin / Backoffice API
- Implemented Nest-based `@instant-games/admin-api` with an `AdminAuthGuard` (simple `x-admin-token` header).
- Endpoints:
  - `GET /admin/rounds`, `GET /admin/rounds/:id`
  - `GET /admin/wallets` and `/admin/wallets/:operator/:user/:currency/:mode`
  - `GET /admin/ledger`
  - `GET /admin/pf/seeds`, `POST /admin/pf/rotate`
  - `GET /metrics` (also added to Dice API)
- Services share the `DB_CLIENT` token; e2e tests cover the full stack.

### Observability
- New Prometheus metrics: `bets_total` (status label), `round_latency_ms` with operator/mode tags, and `wallet_operations_total` with type label.
- Dice logs now capture bet start, settlement, refunds, idempotency hits/conflicts with consistent fields.
- `/metrics` endpoints exist on dice and admin apps for scraping.

### Tests
- `pnpm test` runs unit + e2e suites (Dice real-mode/refund paths, PF rotation, admin API).
- All suites currently pass (see `vitest run` output).


