# Getting Started

Complete guide to running Instant Games locally for development and testing.

## Quick Start (Demo Mode)

The fastest way to get started is using Docker with demo mode. This uses Redis-based wallets (no persistence).

### 1. Start Services with Docker

```bash
# Start Redis
docker run -d --name redis-demo -p 6379:6379 redis:latest

# Start PostgreSQL
docker run -d --name postgres-demo \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=instantgames \
  -p 5432:5432 \
  postgres:latest
```

### 2. Run Migrations

Wait 10-15 seconds for PostgreSQL to initialize, then:

```bash
# Create database
docker exec -i postgres-demo psql -U postgres -c "CREATE DATABASE instantgames;" || true

# Run migrations
docker exec -i postgres-demo psql -U postgres -d instantgames < db/migrations/0001_initial.sql
docker exec -i postgres-demo psql -U postgres -d instantgames < db/migrations/0002_phase3_platform_ops.sql
```

Or with local `psql`:
```bash
export PGPASSWORD=postgres
psql -h localhost -U postgres -d instantgames -f db/migrations/0001_initial.sql
psql -h localhost -U postgres -d instantgames -f db/migrations/0002_phase3_platform_ops.sql
```

### 3. Seed Demo Data

```bash
docker exec -it postgres-demo psql -U postgres -d instantgames

# Run these SQL commands:
INSERT INTO operators (id, name) VALUES ('demo-operator', 'Demo Operator') ON CONFLICT DO NOTHING;

INSERT INTO game_configs (id, operator_id, game, currency, mode, min_bet, max_bet, max_payout_per_round, math_version, demo_enabled, real_enabled, extra)
VALUES (
  gen_random_uuid(),
  'demo-operator',
  'dice',
  'USD',
  'demo',
  '100',
  '100000',
  '1000000',
  'v1',
  true,
  false,
  '{}'
) ON CONFLICT DO NOTHING;
```

### 4. Configure Environment

Create `.env` file or export:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/instantgames
REDIS_URL=redis://localhost:6379
WALLET_IMPL=demo  # Demo mode = Redis-only wallet
```

### 5. Build and Run

```bash
pnpm install
pnpm build
pnpm --filter @instant-games/dice-api start:dev
```

### 6. Test the API

```bash
# Health check
curl http://localhost:3001/dice/health

# Place a bet
curl -X POST http://localhost:3001/dice/bet \
  -H "Content-Type: application/json" \
  -H "x-user-id: demo-user-123" \
  -H "x-operator-id: demo-operator" \
  -H "x-idempotency-key: test-$(date +%s)" \
  -d '{
    "bet": 1000,
    "target": 50,
    "condition": "under"
  }'
```

## Full Setup Guide

### Architecture Overview

The dice-api uses:
- **`dice-api`** (`apps/dice-api`) - NestJS HTTP API
- **`game-math-dice`** (`packages/game-math-dice`) - Math engine
- **Core packages** - Shared services (auth, wallet, database, Redis)

### Prerequisites

1. **PostgreSQL Database** - Game rounds, transactions, config
2. **Redis** - Caching, locks, idempotency, provably fair state
3. **Node.js** with pnpm

### Step-by-Step Setup

#### 1. Set Up Database

Create PostgreSQL database:

```sql
CREATE DATABASE instantgames;
```

Run migrations from `db/migrations/`:
- `0001_initial.sql`
- `0002_phase3_platform_ops.sql`

#### 2. Set Up Redis

Start Redis server:

```bash
# Docker
docker run -d -p 6379:6379 redis:latest

# Or local
redis-server
```

#### 3. Configure Environment Variables

```bash
# Required
DATABASE_URL=postgres://user:password@localhost:5432/instantgames
REDIS_URL=redis://localhost:6379

# Optional (defaults shown)
PORT=3001
LOG_LEVEL=info
METRICS_DISABLED=false
WALLET_IMPL=demo  # or "db" for production
```

**Wallet Modes:**
- `WALLET_IMPL=demo` - Redis-based, non-persistent (development)
- `WALLET_IMPL=db` - PostgreSQL-based, persistent (production)

#### 4. Build the Project

```bash
pnpm install
pnpm build
```

#### 5. Run the Dice API

**Development mode:**
```bash
pnpm --filter @instant-games/dice-api start:dev
```

**Production mode:**
```bash
pnpm --filter @instant-games/dice-api build
pnpm --filter @instant-games/dice-api start
```

API runs on port 3001 (or `PORT` env var).

### Available Endpoints

- `GET /dice/health` - Health check
- `POST /dice/bet` - Place a bet
- `GET /metrics` - Prometheus metrics

### Making Bet Requests

Example bet request:

```bash
curl -X POST http://localhost:3001/dice/bet \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -H "x-operator-id: operator1" \
  -H "x-idempotency-key: unique-key-12345" \
  -d '{
    "bet": 100,
    "target": 50,
    "condition": "under"
  }'
```

**Required Headers:**
- `x-user-id` - User identifier
- `x-operator-id` - Operator identifier
- `x-idempotency-key` - Unique key for idempotency

## What's Different in Demo Mode?

When `WALLET_IMPL=demo`:
- ✅ Wallet balances stored in Redis (in-memory)
- ✅ No wallet persistence to database
- ✅ All other features work normally (RNG, risk checks, round history)
- ✅ Perfect for testing/development

## Troubleshooting

### Database Connection Error
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check database exists and migrations applied

### Redis Connection Error
- Verify `REDIS_URL` is correct
- Ensure Redis server is running
- Default: `redis://localhost:6379`

### Port Already in Use
- Change `PORT` environment variable
- Or stop process using port 3001

### Build Errors
- Ensure dependencies installed: `pnpm install`
- Try cleaning: `pnpm build --force`

### "Game config not found"
- Ensure operator and game config seeded (see Step 3 above)
- Check with: `SELECT * FROM game_configs;`

## Alternative: Simulator CLI

Test math engine without full API stack:

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 1000 \
  --bet 1000 \
  --target 50 \
  --condition under
```

No database/Redis required!

## Next Steps

- **[Gateway Setup](./GATEWAY.md)** - Set up unified game launcher
- **[Simulator Guide](./SIMULATOR.md)** - Test game math and RTP
- **[Production Guide](./PRODUCTION.md)** - Deploy to production

