# PHASE3 AUDIT

## Workspace Map

### Tooling & orchestration
- `pnpm-workspace.yaml` exposes every project under `apps/*` and `packages/*`, so each Nest app, CLI, and shared library is a first-class workspace.
- `turbo.json` defines the monorepo pipeline: `build` (with `^build` fan-in), `lint`, and `test` (depends on `build`) to keep packages/apps in lockstep during CI.

### Applications
| Workspace | Responsibility | Core dependencies |
| --- | --- | --- |
| `apps/dice-api` | Public dice game API (HTTP) with full stack hardening: auth guard, config gating, risk, idempotency, PF RNG, wallet + ledger writes, `/metrics`. | `@instant-games/core-*` packages for auth, config, rng, PF, wallet, ledger, db, redis, logging, metrics, risk, bonus. |
| `apps/admin-api` | Backoffice for operators (rounds, wallets, ledger, PF seed rotation) plus `/metrics`. Protected by `x-admin-token`. | Same infra modules as dice minus wallet router; relies on DB + PF rotation services. |
| `apps/simulator-cli` | Dev CLI to run math experiments (currently dice only). | `game-math-dice`, Node crypto RNG. |
| `apps/{roulette,mines,plinko,hilo,keno,wheel,coinflip}-api` | Placeholders created during scaffolding; each only exports an empty module today. | None yet. |
| `apps/gateway-api` | Placeholder (empty export) for a potential BFF. | None. |

### Packages
| Package | Responsibility / Boundaries | Depends on |
| --- | --- | --- |
| `core-auth` | Header/token based auth guard + `AuthContext`. | Nest, express types. |
| `core-config` | `DbGameConfigService` fetches per-operator game configs from Postgres and caches them in Redis. | `core-db`, `core-redis`. |
| `core-db` | Postgres pool + transaction helper (`IDbClient`) wired via `DATABASE_URL`. | `pg`, Nest Config. |
| `core-redis` | Shared Redis client, KV store, lock manager, pub/sub abstractions using `REDIS_URL`. | `ioredis`. |
| `core-wallet` | Demo wallet (Redis+locks) and real `DbWalletService` (Postgres + Redis locks) plus `WalletRouter`. | `core-db`, `core-redis`. |
| `core-provably-fair` | PF service, rotation service (reads/writes `pf_server_seeds`), Redis-backed PF state store. | `core-db`, `core-redis`. |
| `core-rng` | PF-backed RNG facade used by game services. | `core-provably-fair`. |
| `core-game-history` | Repository for `game_rounds` table (pending/settled/cancelled). | `core-db`. |
| `core-ledger` | Repository for `wallet_transactions`. | `core-db`. |
| `core-idempotency` | Redis-backed `performOrGetCached` with lock. | `core-redis`. |
| `core-risk` | Enforces bet limits + simple rate limiting per operator/game via config + Redis. | `core-config`, `core-redis`. |
| `core-logging` | Pino logger + correlation ID interceptor. | `pino`. |
| `core-metrics` | Prometheus counters/histograms + `/metrics` export. | `prom-client`. |
| `core-bonus` | Bonus port abstraction (currently `NoopBonusPort`). | none. |
| `core-tenant`, `core-types` | Shared typings for operators, games, rounds. | none. |
| `game-math-*` | Math engines per game. `game-math-dice` is production-grade; others are stub heuristics. | none / Node stdlib. |

### Shared assets
- `db/migrations/*.sql` – schema for operators, configs, `game_rounds`, `wallet_transactions`, `wallet_balances`, `pf_server_seeds`, indexes, and constraints.
- `docs/PHASE2-HARDENING.md`, `docs/PHASE3-PLATFORM-OPS.md` – previous milestone reports.

## Config & Environment Wiring
- Every Nest app imports `ConfigModule.forRoot({ isGlobal: true })`, so `ConfigService` surfaces process envs everywhere.
- `core-db` (`DbModule`) pulls `DATABASE_URL` and optional `DB_MAX_CONNECTIONS`; missing vars throw on bootstrap (`packages/core-db/src/index.ts`).
- `core-redis` (`RedisModule`) dials `REDIS_URL` with optional `REDIS_KEY_PREFIX` and exposes KV store + lock manager for other services.
- `WalletRouter` inspects `WALLET_IMPL` (`apps/dice-api/src/app.module.ts` lines 81‑89) to decide whether real-mode flows use the DB wallet or fall back to demo.
- `AdminAuthGuard` compares `x-admin-token` against `ADMIN_API_TOKEN` (`apps/admin-api/src/auth/admin-auth.guard.ts`).
- `MetricsModule` can be disabled via `METRICS_DISABLED`, logging honors `LOG_LEVEL`, and both apps’ `main.ts` accept `PORT`/`ADMIN_API_PORT`.
- Auth: `core-auth` guard reads either `Authorization` bearer payloads or `x-user-id`, `x-operator-id`, `x-currency`, `x-game-mode`, etc., so integration tests can drive the stack without JWT infrastructure.

## Core Flows

### Dice bet flow (`apps/dice-api`)
1. HTTP request hits `/dice/bet`; `AuthGuard` injects `AuthContext` and `DiceController` requires `x-idempotency-key` (`dice.controller.ts` 17‑27).
2. `DiceService.placeBet` wraps `executeBet` with `RedisIdempotencyStore.performOrGetCached`, logging cached vs conflict outcomes (`dice.service.ts` 38‑64, `packages/core-idempotency/src/index.ts` 13‑45).
3. `executeBet`:
   - Validates request body via DTO (`dto/dice-bet.dto.ts`) and converts `betAmount` to `bigint`.
   - Fetches operator/game config from Postgres/Redis (`core-config`) and enforces `demoEnabled`/`realEnabled` flags (lines 70‑79).
   - Builds math config, instantiates `DiceMathEngine`, estimates potential payout, and ensures bet/risk limits via `core-risk` (`dice.service.ts` 78‑84).
   - Resolves wallet implementation based on mode, scopes user IDs with operator prefix, and captures balances (`core-wallet`, lines 85‑104).
   - Debits wallet under Redis lock + Postgres transaction (see `DbWalletService` below) and increments `wallet_operations_total` metrics.
   - Initializes PF context + nonce via `RedisProvablyFairStateStore` and rolls RNG via `ProvablyFairRngService` (`dice.service.ts` 104‑118).
   - Evaluates dice math, conditionally credits payout, records balances, then runs a DB transaction that creates the round (`GameRoundRepository`), marks it settled with PF metadata, and appends ledger BET/PAYOUT entries (`WalletTransactionRepository`, lines 127‑186).
   - Notifies bonus port, emits `bets_total` + `round_latency_ms`, and logs the settlement (lines 189‑217).
4. Error path increments failure metric, logs, rolls back payouts if they were credited, and refunds the original bet inside a DB tx + ledger `REFUND` entry (`dice.service.ts` 218‑288). Refund logging ensures rounds get `CANCELLED` status.

### Provably Fair flow
1. `PfRotationService` (`packages/core-provably-fair/src/index.ts` 123‑193) sources active seeds from `pf_server_seeds`, generates hashes via `ProvablyFairService`, and ensures only one active seed per `(operator, game, mode)`.
2. `RedisProvablyFairStateStore` keys contexts and nonces by `(operatorId, mode, game, userId)` (`CONTEXT_KEY` & `NONCE_KEY`, lines 195‑238). `getOrInitContext` fetches the active DB seed, caches context (including `serverSeedId`, hash, clear seed, client seed), and resets nonce on rotation or client seed change (lines 203‑231).
3. `nextNonce` uses atomic Redis `INCR` with TTL to avoid race conditions (lines 233‑238).
4. During a bet, `DiceService` persists `serverSeedHash`, `serverSeed`, `clientSeed`, `nonce`, and `pfSeedId` (via `meta`) in `game_rounds` (`dice.service.ts` 130‑149). The `game_rounds` migration adds the corresponding columns and PF nonce uniqueness constraint.
5. `/admin/pf/*` endpoints call `PfRotationService` so ops can inspect history or rotate seeds (`apps/admin-api/src/controllers/pf.controller.ts`).

### Wallet flow
- `DemoWalletService` stores balances in Redis and guards debit/credit operations with Redis locks (`packages/core-wallet/src/index.ts` 36‑69).
- `DbWalletService` is the real-money source of truth: `getBalance` lazily inserts rows into `wallet_balances`, while `debitIfSufficient` and `credit` wrap a Redis `withLock` call around a Postgres transaction that `SELECT ... FOR UPDATE` and `UPDATE`s balances (`packages/core-wallet/src/index.ts` 72‑161). Keys always include operatorId, userId, currency, and mode via `scopeWalletUserId`.
- `WalletRouter.resolve` chooses demo vs DB wallet based on `GameMode` and whether a real wallet was injected (`apps/dice-api/src/app.module.ts` 81‑89). In real mode without a DB wallet configured, it falls back to demo (configurable via `allowDemoFallback`).
- Dice flow records both wallet debits and credits inside the same DB transaction as round + ledger writes, so wallet movements and game history stay consistent (`dice.service.ts` 127‑186).

### Admin/backoffice flow (`apps/admin-api`)
1. Each controller runs behind `AdminAuthGuard` which compares `x-admin-token` to `ADMIN_API_TOKEN` (`auth/admin-auth.guard.ts` 5‑27).
2. `RoundsController`/`RoundsService` query `game_rounds` scoped by `operatorId`, `game`, `mode`, optional `userId`, and cursor window to present PF metadata and payouts (`controllers/rounds.controller.ts` + `services/rounds.service.ts` 34‑105).
3. `WalletsController`/`WalletsService` enumerate `wallet_balances` filtered by operator and optional user/currency/mode (`controllers/wallets.controller.ts`, `services/wallets.service.ts` 26‑86).
4. `LedgerController`/`LedgerService` read `wallet_transactions` with filters for operator, user, game, round, type, and time windows (`services/ledger.service.ts` 33‑104).
5. `PfController` surfaces history/rotation via `PfRotationService`, and `/metrics` mirrors the dice API by returning `prom-client` registry output (`controllers/metrics.controller.ts`).

## Phase 3 Invariant Verification
| Area | Statement | Status | Evidence |
| --- | --- | --- | --- |
| Wallets | `DbWalletService` uses operator-aware keys, Postgres source of truth, Redis only for locks/cache. | **Confirmed** | `scopeWalletUserId` adds operator prefix (packages/core-wallet/src/index.ts 32‑34); `DbWalletService.getBalance`/`debitIfSufficient`/`credit` fetch/update `wallet_balances` inside `LOCK_MANAGER.withLock` + DB transactions (lines 72‑161). |
| Wallets | `WalletRouter` routes demo → Redis wallet, real → DB wallet, with optional fallback. | **Confirmed** | `WalletRouter.resolve` switch (packages/core-wallet/src/index.ts 168‑187) and wiring in `apps/dice-api/src/app.module.ts` 71‑89. |
| Wallets | Debit/credit guarded by DB transaction + lock to avoid negative balances. | **Confirmed** | `DbWalletService.debitIfSufficient` acquires lock, runs `SELECT ... FOR UPDATE`, validates balance, and updates row in one txn (packages/core-wallet/src/index.ts 89‑122). |
| Provably Fair | State store keys contexts/nonces by `(operatorId, mode, game, userId)` and uses atomic `INCR`. | **Confirmed** | `CONTEXT_KEY`/`NONCE_KEY` definitions and `nextNonce` implementation (packages/core-provably-fair/src/index.ts 195‑238). |
| Provably Fair | Active server seed loaded from Postgres (`pf_server_seeds`). | **Confirmed** | `PfRotationService.getActiveSeed` query + `INSERT ... RETURNING` fallback (packages/core-provably-fair/src/index.ts 123‑193). |
| Provably Fair | Game rounds persist `serverSeedHash`, `serverSeed`, `clientSeed`, `nonce`, `serverSeedId`. | **Confirmed** | `dice.service.ts` creates pending rounds with PF fields + `meta: { bet, pfSeedId }` (apps/dice-api/src/dice.service.ts 130‑149) and schema defines columns (`db/migrations/0001_initial.sql` 30‑48). |
| Dice lifecycle | Config mode gating enforced per request. | **Confirmed** | `dice.service.ts` 70‑76. |
| Dice lifecycle | Risk checks (min/max bet, max payout, rate limit). | **Confirmed** | `DiceService` calls `riskService.validateBet` (apps/dice-api/src/dice.service.ts 78‑84) and `RiskService` enforces limits (`packages/core-risk/src/index.ts` 22‑52). |
| Dice lifecycle | Money-moving endpoints require `x-idempotency-key` and use Redis idempotency guard. | **Confirmed** | `DiceController` enforces header (apps/dice-api/src/dice.controller.ts 17‑27); `DiceService.placeBet` uses `IIdempotencyStore.performOrGetCached` and handles conflicts (apps/dice-api/src/dice.service.ts 38‑64, packages/core-idempotency/src/index.ts 13‑45). |
| Dice lifecycle | Round + ledger writes occur inside a single DB transaction. | **Confirmed** | `this.db.transaction` wraps pending round creation, settlement, and ledger inserts (apps/dice-api/src/dice.service.ts 127‑186). |
| Dice lifecycle | Refund path logs ledger `REFUND` entries and credits wallet back. | **Confirmed** | Refund branch credits wallet, increments metrics, and logs via `recordRefund` (apps/dice-api/src/dice.service.ts 233‑288). |
| Dice lifecycle | PF RNG drives math (no `Math.random()`). | **Confirmed** | Uses `this.rng.rollInt(pfContext, nonce, 1, 100)` (apps/dice-api/src/dice.service.ts 111‑118). |
| Admin & metrics | Admin endpoints hit correct tables with operator scoping; `/metrics` exposes Prometheus metrics. | **Confirmed** | `RoundsService`, `WalletsService`, `LedgerService` SQL filters include `operator_id` (apps/admin-api/src/services/*.ts). `MetricsController` returns `register.metrics()` for both dice and admin apps (apps/dice-api/src/metrics.controller.ts; apps/admin-api/src/controllers/metrics.controller.ts). |

## Platform Gaps Before Multi-Game
- **PF nonce reset vs DB constraint** – `RedisProvablyFairStateStore` deletes the nonce key whenever a seed rotates (packages/core-provably-fair/src/index.ts 219‑231), but `db/migrations/0001_initial.sql` enforces `UNIQUE (operator_id, user_id, game, mode, nonce)` across history. After the first rotation, inserting `nonce=1` again will violate the constraint in production (not caught by tests because `pg-mem` schema lacks the constraint). Needs reconciliation before enabling frequent rotations.
- **Hardened bet flow only exists inside `DiceService`** – Other game apps are empty shells (`apps/*-api/src/index.ts`). Any new game would have to copy/paste the entire dice pipeline, risking drift in wallet safety, PF usage, metrics, and logging.
- **Real-money misconfiguration fallback** – If `WALLET_IMPL` ≠ `db`, `WalletRouter` silently routes real-mode bets to the demo wallet (`apps/dice-api/src/app.module.ts` 81‑89). This is convenient for local dev but dangerous in shared environments without additional safeguards.
- **PF reveal remains admin-only** – Admin API can rotate seeds but there is no player-facing reveal endpoint or audit log that exposes `serverSeed` after rotation. Users cannot independently verify outcomes yet.
- **Observability parity gaps** – Only dice and admin expose `/metrics`. Future game services (roulette, mines, etc.) currently lack metrics controllers, logging interceptors, and metric counters, so SRE coverage would regress the moment they are enabled.
- **Test schema drift** – `apps/dice-api/__tests__/test-helpers.ts` re-creates tables without several production constraints (e.g., `wallet_transactions.balance_before` NOT NULL, PF nonce uniqueness). Bugs like the nonce reset above won’t surface in CI.
- **Bonus/mode integrations are no-ops** – `NoopBonusPort` fulfills the interface, but no real bonus, anti-fraud, or player-notify side effects happen post-settlement, limiting readiness for promo-heavy launches.

This snapshot completes Phase A. The codebase is ready for extraction of a shared game slice (`GameBetRunner`) and for wiring the other game APIs once the above gaps—especially PF nonce persistence—are addressed during Phase B.

