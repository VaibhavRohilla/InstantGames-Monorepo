# 🚀 Quick Start - Test External Frontend

Get up and running in 3 simple steps!

## Step 1: Start External Frontend Server

Open **Terminal 1**:

```bash
cd examples/external-frontend
node simple-server.js
```

✅ You should see:
```
🎮 External Frontend Test Server
================================
Server running on: http://localhost:8080

Available frontends:
  - Dice Game: http://localhost:8080/dice-game/index.html
```

## Step 2: Start Dice API Backend

Open **Terminal 2**:

```bash
pnpm --filter @instant-games/dice-api start:dev
```

✅ You should see:
```
Dice API is running on port 3001
```

## Step 3: Start Gateway with External Frontend URL

Open **Terminal 3**:

**Windows (PowerShell):**
```powershell
$env:DICE_FRONTEND_URL="http://localhost:8080/dice-game/index.html"
pnpm --filter @instant-games/gateway-api start:dev
```

**Linux/Mac:**
```bash
export DICE_FRONTEND_URL=http://localhost:8080/dice-game/index.html
pnpm --filter @instant-games/gateway-api start:dev
```

✅ You should see:
```
Gateway API is running on port 3000
Games frontend path: ...
```

## Step 4: Test It! 🎮

### In Browser:

Open: **http://localhost:3000/games/dice**

You should see:
- ✅ Green "Connected" badge
- ✅ Configuration showing backend URLs
- ✅ Bet form with inputs
- ✅ "Place Bet" button

Try placing a bet:
1. Enter bet amount: `1000`
2. Set target: `50`
3. Select condition: `Under`
4. Click "Place Bet"
5. See result! 🎉

### Via Command Line:

```bash
# Check game discovery
curl http://localhost:3000/api/v1/games

# Check health
curl http://localhost:3000/api/v1/games/dice/health

# Place a test bet
curl -X POST http://localhost:3000/api/v1/games/dice/bet \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -H "x-operator-id: test-operator" \
  -H "x-idempotency-key: test-123" \
  -d '{"bet": 1000, "target": 50, "condition": "under"}'
```

## 🎯 What's Happening?

1. **Gateway** receives request for `/games/dice`
2. **Gateway** serves wrapper HTML that loads external frontend
3. **External frontend** (from `localhost:8080`) loads in iframe
4. **Config** is injected: `window.GAME_CONFIG` with backend URLs
5. **Frontend** makes API call to `/api/v1/games/dice/bet`
6. **Gateway** proxies request to `dice-api:3001/dice/bet`
7. **Response** returns through gateway to frontend

## 🐛 Troubleshooting

### Frontend shows "Not Connected"

- ✅ Check external frontend server is running on port 8080
- ✅ Verify `DICE_FRONTEND_URL` is set correctly
- ✅ Check browser console (F12) for errors
- ✅ Try accessing frontend directly: `http://localhost:8080/dice-game/index.html`

### API calls failing

- ✅ Verify dice-api is running on port 3001
- ✅ Check gateway logs for proxy errors
- ✅ Ensure all required headers are present in requests

### Port already in use

Change the port:
```bash
PORT=8081 node simple-server.js
export DICE_FRONTEND_URL=http://localhost:8081/dice-game/index.html
```

## 📚 Next Steps

- Read full documentation: `examples/external-frontend/README.md`
- Customize the frontend: Edit `dice-game/index.html`
- Add more games: Create similar structure for other games
- Deploy to production: Upload to CDN and update URLs

## 🎉 Success!

If everything works, you now have:
- ✅ External frontend hosted separately
- ✅ Gateway serving wrapper with config injection
- ✅ API proxying working correctly
- ✅ Complete end-to-end flow

You're ready to deploy frontends separately while keeping unified gateway access!

