# External Frontend Example

This is an example external frontend for the Dice game that demonstrates how to create a frontend that works with the Gateway API.

## Structure

```
examples/external-frontend/
├── dice-game/
│   └── index.html      # Example dice game frontend
├── simple-server.js    # Simple HTTP server to host the frontend
└── README.md          # This file
```

## Quick Start

### Option 1: Use Simple Server (Recommended for Testing)

1. **Start the simple server:**
   ```bash
   cd examples/external-frontend
   node simple-server.js
   ```
   
   Server runs on: `http://localhost:8080`

2. **Configure gateway to use this URL:**
   ```bash
   export DICE_FRONTEND_URL=http://localhost:8080/dice-game/index.html
   ```

3. **Start gateway:**
   ```bash
   pnpm --filter @instant-games/gateway-api start:dev
   ```

4. **Access game via gateway:**
   ```
   http://localhost:3000/games/dice
   ```

### Option 2: Use Python HTTP Server

```bash
cd examples/external-frontend
python -m http.server 8080
```

Then set: `DICE_FRONTEND_URL=http://localhost:8080/dice-game/index.html`

### Option 3: Use Any Static Hosting

Upload the `dice-game/` folder to:
- CDN (AWS S3, CloudFront, etc.)
- Static hosting (Netlify, Vercel, etc.)
- Your own web server

Then set the URL in gateway config.

## Testing Steps

### 1. Start Backend Services

**Terminal 1: Dice API**
```bash
pnpm --filter @instant-games/dice-api start:dev
```

**Terminal 2: External Frontend Server (Simple)**
```bash
cd examples/external-frontend
node simple-server.js
```

**Terminal 3: Gateway**
```bash
export DICE_FRONTEND_URL=http://localhost:8080/dice-game/index.html
pnpm --filter @instant-games/gateway-api start:dev
```

### 2. Test Game Discovery

```bash
curl http://localhost:3000/api/v1/games
```

Should show dice game with `externalFrontendUrl`.

### 3. Access Game

Open browser:
```
http://localhost:3000/games/dice
```

You should see:
- ✅ Status badge showing "Connected"
- ✅ Configuration info showing backend URLs
- ✅ Working bet form

### 4. Test Betting

1. Set bet amount (e.g., 1000)
2. Set target (e.g., 50)
3. Select condition (Under/Over)
4. Click "Place Bet"
5. Should see result with rolled number, win/loss, payout

### 5. Test API Directly

```bash
curl -X POST http://localhost:3000/api/v1/games/dice/bet \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -H "x-operator-id: test-operator" \
  -H "x-idempotency-key: test-123" \
  -d '{
    "bet": 1000,
    "target": 50,
    "condition": "under"
  }'
```

## How It Works

### 1. Gateway Wrapper

When you visit `/games/dice`, gateway:
- Checks if `DICE_FRONTEND_URL` is set
- Serves wrapper HTML that loads your external frontend in iframe
- Injects `window.GAME_CONFIG` with backend URLs

### 2. Config Access

The example frontend tries multiple methods to get config:
- `window.parent.GAME_CONFIG` (from iframe parent)
- `window.GAME_CONFIG` (direct access)
- `window.getGameConfig()` (helper function)
- URL hash (alternative method)
- PostMessage (for cross-origin)

### 3. API Calls

Frontend makes requests to:
```
POST /api/v1/games/dice/bet
```

Gateway proxies to:
```
POST http://localhost:3001/dice/bet
```

## Features Demonstrated

✅ **Config Access** - Multiple methods to get gateway config
✅ **Error Handling** - Shows errors if config unavailable
✅ **UI Feedback** - Loading states, result display
✅ **API Integration** - Makes bet requests via gateway
✅ **Status Indicators** - Shows connection status

## Customization

### Change Frontend URL

Edit your `.env` or export:
```bash
DICE_FRONTEND_URL=https://your-cdn.com/dice-game/index.html
```

### Modify Frontend

Edit `dice-game/index.html`:
- Change styling
- Add features
- Modify UI layout
- Add more game logic

### Add More Games

Create similar structure:
```
examples/external-frontend/
├── dice-game/
├── coinflip-game/
├── roulette-game/
└── ...
```

Then set environment variables:
```bash
COINFLIP_FRONTEND_URL=http://localhost:8080/coinflip-game/index.html
ROULETTE_FRONTEND_URL=http://localhost:8080/roulette-game/index.html
```

## Troubleshooting

### Config Not Loading

- Check browser console for errors
- Verify `DICE_FRONTEND_URL` is set correctly
- Ensure external frontend server is running
- Check CORS settings if using different domain

### API Calls Failing

- Verify dice-api backend is running on port 3001
- Check gateway logs for proxy errors
- Verify headers are being forwarded (x-user-id, x-operator-id, x-idempotency-key)

### Frontend Not Loading

- Verify external frontend URL is accessible
- Check gateway logs for loading errors
- Try accessing external URL directly: `http://localhost:8080/dice-game/index.html`

## Production Deployment

1. **Build your frontend** (if using build tools)
2. **Upload to CDN/static hosting**
3. **Set production URL in gateway config:**
   ```bash
   DICE_FRONTEND_URL=https://cdn.example.com/dice-game/v1.0.0/index.html
   ```
4. **Update gateway base URL:**
   ```bash
   GATEWAY_BASE_URL=https://games-api.example.com
   ```

## Next Steps

- Customize the frontend design
- Add more game features
- Implement real-time updates (WebSocket)
- Add authentication handling
- Implement wallet balance display
- Add game history

