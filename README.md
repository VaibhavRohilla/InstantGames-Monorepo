# Instant Games Backend Monorepo

A Turborepo + pnpm workspace that hosts platform services and dedicated NestJS applications for instant casino games.

## Structure

```
instant-games-backend/
├── apps/
│   ├── dice-api               # First-class game API with full vertical slice
│   ├── ...other game APIs     # Placeholders for future games
│   ├── admin-api              # Admin/backoffice API (stub)
│   └── simulator-cli          # CLI for math/RTP simulations
├── packages/
│   ├── core-*                 # Platform capabilities (auth, config, wallet, etc.)
│   ├── game-math-*            # Pure math engines per game
│   └── core-types             # Shared enums/interfaces
├── db/migrations              # SQL migrations for Postgres
├── tsconfig.base.json         # Path aliases shared across the workspace
├── turbo.json                 # Task pipeline configuration
└── vitest.config.ts           # Shared test runner config
```

## Getting Started

```
pnpm install
pnpm build
```

### Running Services

- **Dice API**: `pnpm --filter @instant-games/dice-api start:dev`
- **Simulator CLI**: `pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 1000 --bet 100 --target 50 --condition under`
- **Tests**: `pnpm test`

### Environment

Set the following variables when running APIs:

```
DATABASE_URL=postgres://user:pass@host:5432/instantgames
REDIS_URL=redis://localhost:6379
LOG_LEVEL=debug
METRICS_DISABLED=false
```

## Highlights

- Config-driven, multi-tenant platform services with Redis/Postgres abstractions.
- Provably fair RNG + state store shared across games.
- Wallet, ledger, risk, idempotency, logging, metrics, and bonus hooks packaged for reuse.
- Dice API demonstrates end-to-end bet flow, including PF rng, wallet debit/credit, round history, ledger logging, metrics, logging, and bonus hooks.
- Vitest suite covering PF service, dice math engine, wallet, and a Nest-powered dice integration test with in-memory adapters.
- Simulator CLI to validate math/RTP offline using the same math engines.

Use this repo as the foundation for onboarding new games—clone the dice vertical slice and plug in the corresponding math package.
