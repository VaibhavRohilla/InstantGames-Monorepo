# How to Run the Dice API Game

This guide explains how to run the `dice-api` game in the InstantGames monorepo.

## Architecture Overview

The dice-api uses:
- **`dice-api`** (`apps/dice-api`) - The NestJS HTTP API that handles bet requests
- **`game-math-dice`** (`packages/game-math-dice`) - Pure math engine for dice game logic
- **Core packages** - Shared platform services (auth, wallet, database, Redis, etc.)

## Prerequisites

Before running the dice-api, you need:

1. **PostgreSQL Database** - For storing game rounds, wallet transactions, and config
2. **Redis** - For caching, locks, idempotency, and provably fair state
3. **Environment Variables** - Configured properly

## Step-by-Step Guide

### 1. Set Up Database

Create a PostgreSQL database and run migrations:

```sql
-- Create database
CREATE DATABASE instantgames;

-- Run migrations from db/migrations/
-- First: 0001_initial.sql
-- Then:  0002_phase3_platform_ops.sql
```

### 2. Set Up Redis

Start a Redis server locally (or use Docker):

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or install and run Redis locally
redis-server
```

### 3. Configure Environment Variables

Set the following environment variables (or create a `.env` file):

```bash
# Required
DATABASE_URL=postgres://user:password@localhost:5432/instantgames
REDIS_URL=redis://localhost:6379

# Optional (with defaults)
PORT=3001                                    # Default: 3001
LOG_LEVEL=debug                              # Default: info
METRICS_DISABLED=false                       # Default: false
WALLET_IMPL=demo                             # Options: "demo" or "db"
REDIS_KEY_PREFIX=ig:                        # Default: "ig:"
DB_MAX_CONNECTIONS=10                        # Default: 10
```

**Note:** 
- `WALLET_IMPL=demo` uses Redis-based demo wallet (good for development)
- `WALLET_IMPL=db` uses PostgreSQL-based wallet (for production)

### 4. Build the Project

Build all packages (required the first time):

```bash
pnpm build
```

This will build all workspace packages including `game-math-dice` and core packages.

### 5. Run the Dice API

**Development mode (with hot reload):**
```bash
pnpm --filter @instant-games/dice-api start:dev
```

**Production mode:**
```bash
# First build
pnpm --filter @instant-games/dice-api build

# Then run
pnpm --filter @instant-games/dice-api start
```

The API will start on port 3001 (or the port specified in `PORT` env var).

### 6. Verify It's Running

Check the health endpoint:
```bash
curl http://localhost:3001/dice/health
```

Expected response:
```json
{"status":"ok"}
```

## Making a Bet Request

The dice API requires:
- **Authentication** - Uses dummy auth by default (check `DummyAuthPort` in `app.module.ts`)
- **Idempotency Key** - Required header `x-idempotency-key`

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

## Available Endpoints

- `GET /dice/health` - Health check
- `POST /dice/bet` - Place a dice bet
- `GET /metrics` - Prometheus metrics endpoint

## Understanding the Flow

1. **Request arrives** at `DiceController.placeBet()`
2. **AuthGuard** validates the user (dummy auth in dev)
3. **DiceService** uses `GameBetRunner` which:
   - Checks game config and risk limits
   - Enforces idempotency
   - Debits wallet
   - Generates provably fair random number
   - Uses `game-math-dice` to evaluate the bet
   - Credits wallet if win
   - Saves round to database
   - Logs ledger transaction
   - Emits metrics

## Testing

Run tests:
```bash
pnpm test
```

Run dice-specific tests:
```bash
pnpm --filter @instant-games/dice-api test
```

## Troubleshooting

### Database Connection Error
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check database exists and migrations are applied

### Redis Connection Error
- Verify `REDIS_URL` is correct
- Ensure Redis server is running
- Default: `redis://localhost:6379`

### Port Already in Use
- Change `PORT` environment variable
- Or stop the process using port 3001

### Build Errors
- Ensure all dependencies are installed: `pnpm install`
- Try cleaning and rebuilding: `pnpm build --force`

## Simulator CLI (Alternative Way to Test Math)

You can also test the dice math engine directly using the simulator CLI:

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 1000 --bet 100 --target 50 --condition under
```

This runs simulations without needing the full API stack.

