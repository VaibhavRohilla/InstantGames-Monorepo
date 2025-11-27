# Phase 2 Hardening Summary

## Implemented fixes
- **Redis BigInt-safe cache + config cache test**: added structured serialization helpers and covered DbGameConfigService caching to unblock PF/risk consumers.
- **Wallet isolation & ledger safety**: namespaced demo-wallet keys per operator, introduced helper scoping, added wallet isolation tests, and wrapped dice round + ledger writes inside Postgres transactions with refund logging.
- **Provably fair resilience**: PF state store now keys on operator+mode, uses atomic INCR for nonces, retains contexts longer, and added state-store regression tests.
- **Provably fair flow enforcement**: dice service threads operator/mode through PF APIs and logs deterministic rolls only after wallet debits succeed.
- **Idempotency & locking**: controller now requires `x-idempotency-key`, Redis idempotency store uses NX locks/polling, and duplicate e2e requests assert stable responses.
- **Math & DTO precision**: dice math applies fixed-point multipliers so large betAmount values keep precision; DTO ensures betAmount ≥ 1.
- **Risk/config gating**: risk rate limits rely on atomic Redis counters; dice rejects disabled modes via `ForbiddenException` with coverage in e2e tests.
- **Schema & migrations**: cleaned initial migration header, enforced wallet balance NOT NULL, added PF nonce uniqueness and supporting indexes.
- **Redis/Wallet integration tests**: added serializer unit tests, wallet operator-isolation tests, PF state-store tests, risk/idempotency tests, and strengthened dice e2e coverage.
- **Stubs annotated**: flagged non-dice math packages as non-production to avoid accidental enablement.

## Remaining TODOs
- Implement DB-backed wallet + ledger cohesion for real-money mode and treat Redis balances as cache only.
- Add PF server-seed rotation + historical reveal APIs for audits.
- Build admin/backoffice API for round + wallet visibility and PF verification.
- Harden additional game APIs using the dice template after these platform changes bake.

## Updated readiness scores
- Architecture layering: **6/10** (clear boundaries, fewer cross-cutting issues)
- Dice vertical slice readiness: **6/10** (transactional, idempotent, PF-safe)
- Platform multi-game readiness: **4/10** (core services tested but other games remain stubs)
- Real-money production readiness: **4/10** (wallet still Redis-based; PF history + admin tooling pending)

## Regression suite
- `pnpm turbo run build`
- `pnpm test`
