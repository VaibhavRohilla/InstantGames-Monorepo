# Architecture Audit – InstantGames Monorepo

## High-Level Structure Map

### Apps
- `apps/gateway-api` – Public entrypoint that proxies JWT-authenticated requests into the selected game service, serves demo frontends/wrappers, and exposes health + metrics routing.
- `apps/admin-api` – Operator tooling (wallet, rounds, ledger, provably-fair seed management) layered on top of `core-db`, exposing secured CRUD/search endpoints.
- `apps/{dice,mines,plinko,coinflip,wheel,hilo,keno,roulette}-api` – One NestJS vertical slice per game. Each wires shared providers (config, RNG, risk, wallet, ledger, idempotency, math engine) and exposes `/bet` + `/health`/`/metrics`.
- `apps/test-utils` – Shared end-to-end harness and seeding helpers used by all game tests (in-memory stores, fake DB/Redis adapters, JWT test helpers).
- `apps/simulator-cli` – Node CLI that reuses math engines to run RTP simulations per game without spinning up services.

### Packages
- Platform infra: `core-auth` (JWT guard + decorators), `core-db` (pg adapter), `core-redis` (key-value, locks, pub/sub), `core-logging` (Pino + correlation), `core-metrics` (Prometheus), `core-config` (game config cache), `core-tenant` (operator/brand types).
- Game transaction core: `core-wallet` (demo + real wallet adapters + router), `core-ledger` (wallet tx repository), `core-game-history` (round persistence), `core-risk` (limit + rate control), `core-idempotency` (Redis-backed), `core-game-slice` (`GameBetRunner` orchestration), `core-bonus` (bonus hooks), `core-provably-fair` + `core-rng`.
- Math engines: `game-math-*` packages encapsulate house math per title and expose deterministic engines so services don’t own math logic.
- Shared types/utilities: `core-types`, `core-bonus`, `core-math-*`, docs, and examples for external frontends.

**Layering:** Apps consume packages exclusively through the `@instant-games/*` path aliases. Packages do not import from `apps/*`, preserving clean layering and making extraction feasible.

## AuthReadiness (JWT-only status)
- **Single source of truth:** `AuthContext` in `core-auth` remains the canonical auth shape. `JwtAuthPort` now emits structured `RgsErrorCode` payloads on every failure path (missing claims, expiry, invalid signature) so operators receive consistent errors.
- **Guard discipline:** `AuthGuard` only inspects `Authorization: Bearer …`, sets `request.authContext`, and the `@Auth()` decorator reads the same property. All controllers (games + gateway) were migrated off the deprecated `@CurrentUser()` alias; the shim stays exported purely for backwards compatibility.
- **Infra alignment:** Removed the stale `DummyAuthPort` overrides so every game consumes the same JWT-only pipeline wired by `AuthModule`.

## Game API Architecture Quality
- **Dice as reference:** Dice now imports `GameCoreModule` (new shared module in `@instant-games/game-core`) which wires the full provider graph (DB, Redis, wallets, PF, idempotency, risk, metrics, logger) once. `DiceService` consumes cached math engines to avoid rebuilding per request.
- **Other games:** Mines and Coinflip were also migrated to `GameCoreModule`, drastically reducing boilerplate. Remaining games still inlined the provider wiring—migrating them is now mechanical.
- **Shared enforcement:** A reusable `@IdempotencyKey()` decorator in `core-idempotency` enforces the `x-idempotency-key` header for every bet endpoint, eliminating per-controller header plumbing and aligning error payloads.

## Single Source of Truth (beyond auth)
- **Wallet semantics (`core-wallet`):** Demo and DB wallet adapters implement the same `IWalletPort`. `WalletRouter` ensures all bankroll changes flow through one abstraction. Only admin tooling reads the balances table directly (for analytics), which is acceptable.
- **Ledger + rounds (`core-ledger`, `core-game-history`):** `GameBetRunner` instantiates repositories per transaction and logs BET/PAYOUT/REFUND entries consistently. Reusable repository factories keep SQL isolated from apps.
- **Idempotency (`core-idempotency`):** Every bet path hands its request to `GameBetRunner.run`, wrapped by `RedisIdempotencyStore`. The new decorator standardizes how request IDs enter the stack.
- **Config/tenancy (`core-config`, `core-tenant`):** Config requests always flow through `DbGameConfigService`, which caches in Redis and encodes operator/currency/mode in the cache key. No service hard-codes local config.
- **Math engines:** All payout logic lives in `game-math-*` packages referenced by each service. Heavier engines (Dice, Plinko, Keno) are now memoized per config/risk profile to avoid per-request allocations.
- **Error catalog:** Introduced `@instant-games/core-errors` and adopted it in `core-auth`, `core-idempotency`, and `core-game-slice` so auth/risk/idempotency flows emit typed error codes operators can rely on. Wallet + proxy layers still need to migrate.

## PerformanceHotspots & Scalability Notes
- **Gateway HTML cache:** Custom frontend HTML is now cached in-memory (prod only) to avoid synchronous disk reads on every request. Still TODO: CDN + streaming for large bundles.
- **Math engine memoization:** Dice now caches engines per math config, while Plinko/Keno reuse singletons to avoid reconstructing heavy lookup tables.
- **Still open:** `GameProxyService` lacks circuit-breaking/backoff, and wallets still read balances twice per bet—both remain future optimizations.

## Exportability & Reuse
- Packages already expose clean entry points (`index.ts` barrels) and rely on environment variables rather than hard-coded paths, so they can be published with minimal work. Keep verifying that no package imports from `apps/*` (currently true).
- Game services only depend on Nest + `@instant-games/*` packages plus env vars, so extracting e.g. `dice-api` into its own repo would mainly require vendoring the shared modules. Creating a reusable Nest module that wires common providers (wallets, PF, risk, metrics) would accelerate such exports and remove deep relative imports.
- `apps/test-utils` should be moved to `packages/test-utils` (or published) so downstream repos can reuse the harness without copying files.
- Preference for `@instant-games/core-*` imports already mirrors how published packages would look; ensure the same aliasing is achievable via `exports` fields when publishing to npm.

## Refactor Round 1 (Nov 2025)
- `@instant-games/game-core` added and adopted by `dice-api`, `mines-api`, and `coinflip-api` to centralize Nest provider wiring (DB, Redis, wallets, PF, risk, logging, metrics).
- `@CurrentUser()` fully retired in favor of `@Auth()`.
- Introduced `@IdempotencyKey()` decorator and enforced it across all bet endpoints.
- Added `@instant-games/core-errors` and upgraded auth/risk/idempotency flows to emit consistent error payloads.
- Cached gateway custom frontends and memoized heavy math engines (Dice per-config cache, Plinko/Keno singletons).

## Prioritized TODOs
1. **High / Medium effort** – Migrate the remaining game APIs (wheel, hilo, keno, roulette, plinko) onto `GameCoreModule` to eliminate divergent provider graphs.
2. **High / Medium effort** – Roll the `core-errors` payloads through wallet adapters, bonus hooks, and gateway proxy responses so operators never see raw strings like `INSUFFICIENT_FUNDS`.
3. **Medium / Medium effort** – Extend the `@IdempotencyKey()` decorator to gateway/admin flows that mutate wallet state (refunds, bonuses) and emit metrics + traces for missing keys.
4. **Medium / Medium effort** – Harden `GameProxyService` with a shared HTTP client (keep-alive, retries, circuit breaking) and propagate correlation IDs to downstream games.
5. **Low / Medium effort** – Extract `apps/test-utils` into `@instant-games/test-utils` so downstream repos can import the harness without reaching into `apps/`.
6. **Low / Low effort** – Investigate wallet delta APIs (`debitAndReturnBalance`) to avoid redundant balance reads inside `GameBetRunner`.

Document owner: Backend Architecture Guild – please extend this file as new apps/packages land.

