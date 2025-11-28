# Quick Start: Running Dice API in Demo Mode

This is the **simplest way** to get the dice-api running for demo/testing purposes.

## Minimal Requirements

Even in demo mode, you need:
- ✅ **Redis** (for demo wallet, idempotency, caching)
- ✅ **PostgreSQL** (for game config, rounds, provably fair seeds)
- ✅ **Node.js** with pnpm

The `WALLET_IMPL=demo` setting means wallet balances are stored in Redis only (not persisted to DB), but the database is still needed for other services.

## Quick Setup with Docker (Recommended)

### 1. Start Redis and PostgreSQL with Docker

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

### 2. Wait for PostgreSQL to be ready (10-15 seconds), then run migrations

```bash
# Install dependencies if needed
pnpm install

# Connect to PostgreSQL and create database (if it doesn't exist)
docker exec -i postgres-demo psql -U postgres -c "CREATE DATABASE instantgames;" || true

# Run migrations
docker exec -i postgres-demo psql -U postgres -d instantgames < db/migrations/0001_initial.sql
docker exec -i postgres-demo psql -U postgres -d instantgames < db/migrations/0002_phase3_platform_ops.sql
```

Or if you have `psql` installed locally:
```bash
export PGPASSWORD=postgres
psql -h localhost -U postgres -d instantgames -f db/migrations/0001_initial.sql
psql -h localhost -U postgres -d instantgames -f db/migrations/0002_phase3_platform_ops.sql
```

### 3. Set Environment Variables

Create a `.env` file in the project root (or export them in your shell):

```bash
# Database (required)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/instantgames

# Redis (required)
REDIS_URL=redis://localhost:6379

# Wallet mode (demo = Redis-only wallet, no DB persistence)
WALLET_IMPL=demo

# Optional
PORT=3001
LOG_LEVEL=info
```

### 4. Seed Demo Data (Optional but Recommended)

To have a working game config, you need at least one operator and game config in the database:

```bash
# Connect to database
docker exec -it postgres-demo psql -U postgres -d instantgames

# Then run:
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

### 5. Build and Run

```bash
# Build all packages (first time only)
pnpm build

# Run dice-api in development mode
pnpm --filter @instant-games/dice-api start:dev
```

You should see:
```
Dice API is running on port 3001
```

## Testing the API

### Health Check
```bash
curl http://localhost:3001/dice/health
```

### Place a Demo Bet

```bash
curl -X POST http://localhost:3001/dice/bet \
  -H "Content-Type: application/json" \
  -H "x-user-id: demo-user-123" \
  -H "x-operator-id: demo-operator" \
  -H "x-idempotency-key: unique-key-$(date +%s)" \
  -d '{
    "bet": 1000,
    "target": 50,
    "condition": "under"
  }'
```

**Expected Response:**
```json
{
  "roundId": "...",
  "rolled": 42.5,
  "win": true,
  "payout": 2000,
  "serverSeed": "...",
  "clientSeed": "...",
  "nonce": 1
}
```

## What's Different in Demo Mode?

When `WALLET_IMPL=demo`:
- ✅ Wallet balances stored in Redis (in-memory, lost on restart)
- ✅ No wallet persistence to database
- ✅ All other features work normally (RNG, risk checks, round history, etc.)
- ✅ Perfect for testing/development

## Troubleshooting

### "DATABASE_URL is not configured"
- Make sure you've set the `DATABASE_URL` environment variable
- Check that PostgreSQL is running: `docker ps | grep postgres-demo`

### "Connection refused" to Redis
- Check Redis is running: `docker ps | grep redis-demo`
- Test connection: `docker exec -it redis-demo redis-cli ping` (should return "PONG")

### "Game config not found" errors
- Make sure you seeded the operator and game config (step 4 above)
- Check with: `docker exec -it postgres-demo psql -U postgres -d instantgames -c "SELECT * FROM game_configs;"`

### Database connection errors
- Wait a few seconds after starting PostgreSQL - it takes time to initialize
- Check PostgreSQL logs: `docker logs postgres-demo`

## Alternative: Use Simulator CLI (No API Needed)

If you just want to test the math engine without setting up the full API:

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 100 --bet 1000 --target 50 --condition under
```

This runs simulations offline with no database/Redis required!

