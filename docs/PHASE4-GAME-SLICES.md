# PHASE 4 – SHARED GAME SLICE & MULTI-GAME BACKENDS

## Highlights
- **Shared `GameBetRunner`** (`@instant-games/core-game-slice`): centralizes config gating, risk checks, idempotency, wallet debits/credits, PF RNG, DB transaction (round + ledger), refunds, bonus notifications, logging, and metrics. All games now call this runner with a standardized `GameBetContext`, `GameBetRequest`, and `IGameMathEngine`.
- **Refactored Dice** to use the runner while keeping the public API intact; idempotency is now handled inside the runner.
- **Stubbed PF-driven math engines** across `game-math-*` packages so every game implements the shared interface. Each engine consumes only the PF RNG supplied by the runner and clamps payouts to safe multipliers.
- **Full-stack APIs for** roulette, mines, plinko, hi-lo, keno, wheel, and coin flip. Every app mirrors the hardened dice stack: Nest guard, DTO validation, service backed by `GameBetRunner`, metrics endpoint, and configurable wallet routing.
- **E2E coverage**: each new app ships with a Vitest + Supertest suite that exercises happy-path bets, mode toggles, idempotency caching, and risk enforcement over the in-memory Postgres/Redis harness.
- **Docs**: `PHASE3-AUDIT.md` captures the platform audit, while this file tracks the multi-game slice rollout.

## Game Runner Port
- Added `GameBetRunner` plus interfaces (`GameBetContext`, `GameBetRequest`, `GameEvaluationResult`, `IGameMathEngine`) under `packages/core-game-slice`.
- Runner enforces:
  - Config gating (`demoEnabled`/`realEnabled`) and preloaded config support to avoid duplicate fetches.
  - Risk validation with `BadRequestException` remap for `RiskViolationError`.
  - Idempotency guard (Redis-backed) with cached status metrics.
  - Wallet routing (demo vs DB), debit/credit logging, and automatic refunds if settlement fails.
  - PF context hydration, nonce tracking, RNG binding (single draw per bet in this phase), and round persistence with PF metadata.
  - Ledger writes for BET/PAYOUT/REFUND, bonus hooks, metrics (`bets_total`, `round_latency_ms`, `wallet_operations_total`), and structured logging.
- Dice now instantiates a `DiceMathEngine` via runner; `DiceBetResponse` is mapped from runner output so the transport contract remains unchanged.

## Math Engines
- `game-math-dice` now implements `IGameMathEngine`, emitting evaluation metadata (rolled, win flag, multiplier).
- Stub engines for roulette, mines, plinko, hi-lo, keno, wheel, and coin flip implement the shared interface and use only the PF RNG supplied by the runner. Each exposes metadata covering the synthetic outcome (bucket, hits, choice, etc.) to support future analytics/debugging.

## Game Apps
Every app (`apps/<game>-api`) includes:
- Nest module with the same core providers as dice (Auth, DB, Redis, PF rotation/state, wallet router, risk, bonus, metrics, logging).
- Controller at `/<game>/bet` with `AuthGuard` + `x-idempotency-key` requirement.
- Service that builds a `GameBetContext`, forwards the DTO payload to `GameBetRunner`, and returns a game-specific response DTO.
- `MetricsController` proxying Prometheus metrics.
- `main.ts` bootstrap with unique default ports.

## Tests
- Shared harness (`apps/test-utils/game-test-harness.ts`) provisions pg-mem + in-memory Redis equivalents, and `game-e2e-suite.ts` registers common behavioural tests (happy path, mode gating, idempotency, risk).
- Dice tests were updated to consume the relocated helpers so all game suites share the same in-memory harness.

## Remaining Work
- Runner currently supports one RNG draw per bet; extending to multi-draw math will require batching nonce increments.
- PF nonce reset vs DB uniqueness constraint still needs resolution (tracked in audit). `pg-mem` schemas should include the production uniqueness constraints to surface this during tests.
- Bonus port is still `Noop`; real promo adapters will be plugged in when product requirements are ready.

