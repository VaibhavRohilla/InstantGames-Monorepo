# Quick Test Commands

Quick reference for testing the external frontend setup.

## Terminal 1: External Frontend Server

```bash
cd examples/external-frontend
node simple-server.js
```

Server runs on: `http://localhost:8080`

## Terminal 2: Dice API Backend

```bash
pnpm --filter @instant-games/dice-api start:dev
```

API runs on: `http://localhost:3001`

## Terminal 3: Gateway

```bash
# Windows PowerShell
$env:DICE_FRONTEND_URL="http://localhost:8080/dice-game/index.html"
pnpm --filter @instant-games/gateway-api start:dev

# Linux/Mac
export DICE_FRONTEND_URL=http://localhost:8080/dice-game/index.html
pnpm --filter @instant-games/gateway-api start:dev
```

Gateway runs on: `http://localhost:3000`

## Testing Commands

### 1. Check External Frontend

```bash
curl http://localhost:8080/dice-game/index.html
```

### 2. Check Gateway Game Discovery

```bash
curl http://localhost:3000/api/v1/games
```

Should show `externalFrontendUrl` for dice game.

### 3. Check Gateway Health

```bash
curl http://localhost:3000/health
```

### 4. Check Dice Game Health (via Gateway)

```bash
curl http://localhost:3000/api/v1/games/dice/health
```

### 5. Test Bet API (via Gateway)

```bash
curl -X POST http://localhost:3000/api/v1/games/dice/bet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "x-idempotency-key: test-$(date +%s)" \
  -d '{
    "bet": 1000,
    "target": 50,
    "condition": "under"
  }'
```

> Tip: generate `<JWT_TOKEN>` using the snippet from [docs/GETTING_STARTED.md](../../docs/GETTING_STARTED.md#authentication-jwt-for-demo--production) and open the page with `?session=<JWT_TOKEN>`.

### 6. Access Game in Browser

Open: `http://localhost:3000/games/dice?session=<JWT_TOKEN>`

> Use the same token you generated for the API tests.

Should see:
- ✅ Connected status
- ✅ Configuration info
- ✅ Working bet form

## All-in-One Test Script

### Windows (PowerShell)

```powershell
cd examples/external-frontend
.\test-setup.ps1
```

### Linux/Mac

```bash
cd examples/external-frontend
chmod +x test-setup.sh
./test-setup.sh
```

## Troubleshooting

### Frontend Server Port Already in Use

```bash
# Use different port
PORT=8081 node simple-server.js

# Then update gateway config
export DICE_FRONTEND_URL=http://localhost:8081/dice-game/index.html
```

### Config Not Loading

1. Check browser console (F12)
2. Verify external frontend URL is accessible
3. Check gateway logs for errors
4. Ensure CORS headers are set correctly

### API Calls Failing

1. Verify dice-api is running on port 3001
2. Check gateway logs for proxy errors
3. Verify headers:
   - `Authorization: Bearer <token>`
   - `x-idempotency-key`

