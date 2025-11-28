# Reference Guide

Quick reference for common tasks and configuration.

## Changing RTP (Return to Player)

RTP = 100% - House Edge%

### In Simulator CLI

Use `--houseEdge` parameter:

```bash
# 95% RTP (5% house edge)
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 10000 --bet 1000 --target 50 --condition under --houseEdge 5

# 90% RTP (10% house edge)
--houseEdge 10

# 99.5% RTP (0.5% house edge)
--houseEdge 0.5
```

### In API (Production)

Update `game_configs` table in database:

```sql
-- Update house edge to 5% (95% RTP)
UPDATE game_configs
SET extra = jsonb_set(
  COALESCE(extra, '{}'::jsonb),
  '{houseEdge}',
  '5'
)
WHERE operator_id = 'your-operator' 
  AND game = 'dice';

-- Clear Redis cache (important!)
-- Or restart the API
```

**Important:** Clear Redis cache after updating database!

## Game Ports

| Game | Default Port | Environment Variable |
|------|-------------|---------------------|
| dice | 3001 | DICE_API_URL |
| coinflip | 3009 | COINFLIP_API_URL |
| roulette | 3003 | ROULETTE_API_URL |
| mines | 3004 | MINES_API_URL |
| hilo | 3006 | HILO_API_URL |
| plinko | 3005 | PLINKO_API_URL |
| wheel | 3008 | WHEEL_API_URL |
| keno | 3007 | KENO_API_URL |
| gateway | 3000 | GATEWAY_PORT |

## Environment Variables

### Required

```bash
DATABASE_URL=postgres://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379
```

### Optional (with defaults)

```bash
# API Ports
PORT=3001                                    # Default: varies by service
GATEWAY_PORT=3000                            # Default: 3000

# Wallet
WALLET_IMPL=demo                             # Options: "demo" or "db"

# Authentication
AUTH_JWT_ALGO=HS256                          # "HS256" (dev) or "RS256" (prod)
AUTH_JWT_SECRET=dev-super-secret-key         # Required if using HS256
# For RS256 deployments:
# AUTH_JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
AUTH_JWT_ISSUER=https://operator.example.com # Optional but recommended
AUTH_JWT_AUDIENCE=instant-games              # Optional but recommended

# Logging
LOG_LEVEL=info                               # Default: info
METRICS_DISABLED=false                       # Default: false

# Redis
REDIS_KEY_PREFIX=ig:                        # Default: "ig:"

# Database
DB_MAX_CONNECTIONS=10                        # Default: 10

# Gateway
GATEWAY_BASE_URL=http://localhost:3000
GAME_BACKEND_HOST=http://localhost
GAMES_FRONTEND_PATH=./public/games
FRONTEND_ORIGIN=*
```

### Game-Specific URLs

```bash
# Backend URLs (optional - defaults to localhost:PORT)
DICE_API_URL=http://localhost:3001
COINFLIP_API_URL=http://localhost:3009
# ... etc

# External Frontend URLs (optional)
DICE_FRONTEND_URL=https://cdn.example.com/dice
COINFLIP_FRONTEND_URL=https://cdn.example.com/coinflip
# ... etc
```

## Typical House Edge Values

| Industry | House Edge | RTP | Use Case |
|----------|-----------|-----|----------|
| Online Casino | 1-2% | 98-99% | Standard, competitive |
| Land Casino | 2-5% | 95-98% | Traditional, higher margins |
| Aggressive | 5-10% | 90-95% | High-profit, less competitive |
| Promotional | 0.5-1% | 99-99.5% | Marketing, player acquisition |
| Fair Game | 0% | 100% | Special events, provably fair demo |

## Multiplier Formula

For Dice game:
```
multiplier = (1 - houseEdge/100) / probability
```

Example: Target 50, Condition "under" (49% win probability)

| House Edge | RTP | Multiplier | Payout on 1000 bet |
|------------|-----|------------|-------------------|
| 0% | 100% | 2.0408x | 2,040.80 |
| 1% | 99% | 2.0204x | 2,020.40 |
| 5% | 95% | 1.9388x | 1,938.80 |
| 10% | 90% | 1.8367x | 1,836.70 |

## Quick Commands

### Start Services

```bash
# Dice API
pnpm --filter @instant-games/dice-api start:dev

# Gateway
pnpm --filter @instant-games/gateway-api start:dev

# Simulator
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 1000
```

### Test API

```bash
# Health check
curl http://localhost:3001/dice/health

# Generate a dev token (requires AUTH_JWT_SECRET to be set)
DEV_TOKEN=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({
  sub:'user123',operatorId:'operator1',currency:'USD',mode:'demo'
}, process.env.AUTH_JWT_SECRET || 'dev-super-secret-key',{algorithm:'HS256',expiresIn:'1h'}));")

# Place bet using JWT auth
curl -X POST http://localhost:3001/dice/bet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "x-idempotency-key: test-123" \
  -d '{"bet": 1000, "target": 50, "condition": "under"}'
```

| JWT Claim   | Description              | Required |
|-------------|--------------------------|----------|
| `sub`       | User ID                  | ✅ |
| `operatorId`| Operator / tenant ID     | ✅ |
| `currency`  | ISO currency code        | ✅ |
| `mode`      | `"demo"` or `"real"`     | ✅ |
| `brandId`   | Brand identifier         | optional |
| `country`   | ISO country code         | optional |
| `isTestUser`| Boolean flag             | optional |

### Database

```sql
-- Check game configs
SELECT * FROM game_configs WHERE game = 'dice';

-- Check operators
SELECT * FROM operators;

-- Check wallet balances
SELECT * FROM wallet_balances;
```

## Troubleshooting

### Common Issues

**Module not found:**
```bash
pnpm install
pnpm build
```

**Port already in use:**
- Change `PORT` environment variable
- Or stop the process using that port

**Database connection error:**
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check database exists

**Redis connection error:**
- Verify `REDIS_URL` is correct
- Ensure Redis server is running

## Next Steps

- **[Getting Started](./GETTING_STARTED.md)** - Full setup guide
- **[Simulator Guide](./SIMULATOR.md)** - Test game math
- **[Production Guide](./PRODUCTION.md)** - Production deployment

