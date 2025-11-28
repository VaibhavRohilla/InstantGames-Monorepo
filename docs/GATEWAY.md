# Gateway API - Complete Guide

The Gateway API is a **complete game launcher** that serves game frontends and routes API calls to backend services.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Serving Frontends](#serving-frontends)
   - [Local Frontends](#local-frontends)
   - [External Frontends](#external-frontends)
5. [API Routing](#api-routing)
6. [Configuration](#configuration)
7. [Deployment](#deployment)

## Overview

The Gateway API provides:
- ✅ **Serves game frontends** - Local or external URLs
- ✅ **Routes API calls** - Proxies to backend game services
- ✅ **Injects backend URLs** - Automatically provides config to frontends
- ✅ **Game discovery** - Lists all available games
- ✅ **Unified entry point** - Single URL for all games

## Quick Start

### 1. Start Backend Services

```bash
# Start dice-api
pnpm --filter @instant-games/dice-api start:dev
```

### 2. Start Gateway

```bash
# Local frontends (serves from public/games/)
pnpm --filter @instant-games/gateway-api start:dev

# Or with external frontend URL
export DICE_FRONTEND_URL=http://localhost:8080/dice-game/index.html
pnpm --filter @instant-games/gateway-api start:dev
```

### 3. Access Games

```
http://localhost:3000/games          # Game lobby
http://localhost:3000/games/dice     # Dice game
```

## Architecture

```
Client Browser
    ↓
http://localhost:3000/games/dice
    ↓
Gateway API (Port 3000)
    ├─ GET /games/dice → Serves HTML with injected config
    ├─ GET /games/dice/assets/* → Serves static files
    └─ POST /api/v1/games/dice/bet → Proxies to dice-api:3001
    ↓
Individual Game APIs (3001, 3002, 3003...)
```

### Request Flow

1. User visits `/games/dice`
2. Gateway serves HTML with `window.GAME_CONFIG` injected
3. Frontend loads assets from `/games/dice/assets/*`
4. Frontend makes API call to `/api/v1/games/dice/bet`
5. Gateway proxies to `dice-api:3001/dice/bet`
6. Response returns through gateway to frontend

## Serving Frontends

### Local Frontends

Place frontend files in:
```
public/games/
└── dice/
    ├── index.html      # Optional: Custom HTML
    └── assets/
        ├── game.js
        ├── style.css
        └── images/
```

Gateway automatically serves from `public/games/` directory.

**Example:**
```
GET /games/dice → public/games/dice/index.html (or template)
GET /games/dice/assets/game.js → public/games/dice/assets/game.js
```

### External Frontends

Host frontends separately (CDN, separate server, etc.) and configure URLs:

```bash
# Environment variables
DICE_FRONTEND_URL=https://cdn.example.com/dice-game/index.html
COINFLIP_FRONTEND_URL=https://games.example.com/coinflip
ROULETTE_FRONTEND_URL=https://s3.amazonaws.com/bucket/roulette/index.html
```

**How it works:**
1. Gateway serves wrapper HTML that loads external frontend in iframe
2. Config is injected: `window.GAME_CONFIG`
3. External frontend accesses config from parent window
4. API calls go through gateway proxy

> 🔐 The JWT is not auto-generated. Append `?session=<JWT_TOKEN>` when opening `GET /games/:gameId` (or supply `window.GAME_CONFIG.jwtToken` if you control the wrapper) so the iframe can attach `Authorization: Bearer <token>` on every request.

**Frontend Integration:**

```javascript
// Preferred: read ?session=<token> from the iframe URL
const params = new URLSearchParams(window.location.search);
const tokenFromUrl = params.get("session");

// Optional fallback (if iframe is same-origin with gateway)
const config = window.parent?.GAME_CONFIG || window.GAME_CONFIG;
const token = tokenFromUrl || config?.jwtToken;

if (!token) {
  throw new Error("Missing JWT token. Append ?session=<token> when loading this page.");
}

fetch(`${config.apiBaseUrl}/bet`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "x-idempotency-key": self.crypto?.randomUUID?.() ?? `bet-${Date.now()}`
  },
  body: JSON.stringify({ bet: 1000, target: 50, condition: "under" })
});
```

**Example Setup:**
See [External Frontend Example](../examples/external-frontend/README.md) for complete working example.

## API Routing

All API calls go through the gateway:

```
POST /api/v1/games/:gameId/bet
GET  /api/v1/games/:gameId/health
GET  /api/v1/games/:gameId/metrics
```

Gateway proxies to backend services automatically.

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/games/dice/bet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "x-idempotency-key: test-123" \
  -d '{"bet": 1000, "target": 50, "condition": "under"}'
```

This proxies to: `http://localhost:3001/dice/bet`

## Configuration

### Environment Variables

```bash
# Gateway
GATEWAY_PORT=3000
GATEWAY_BASE_URL=http://localhost:3000

# Game Backend URLs (optional - defaults to localhost:PORT)
DICE_API_URL=http://localhost:3001
COINFLIP_API_URL=http://localhost:3009
ROULETTE_API_URL=http://localhost:3003
MINES_API_URL=http://localhost:3004
HILO_API_URL=http://localhost:3006
PLINKO_API_URL=http://localhost:3005
WHEEL_API_URL=http://localhost:3008
KENO_API_URL=http://localhost:3007

# External Frontend URLs (optional)
DICE_FRONTEND_URL=https://cdn.example.com/dice
COINFLIP_FRONTEND_URL=https://cdn.example.com/coinflip
# ... etc

# Frontend Path (optional - defaults to ./public/games)
GAMES_FRONTEND_PATH=./public/games

# CORS (optional)
FRONTEND_ORIGIN=*
```

### Game Ports

| Game | Default Port |
|------|-------------|
| dice | 3001 |
| coinflip | 3009 |
| roulette | 3003 |
| mines | 3004 |
| hilo | 3006 |
| plinko | 3005 |
| wheel | 3008 |
| keno | 3007 |

## API Endpoints

### Frontend Routes

- `GET /games` - Game lobby (lists all games)
- `GET /games/:gameId?session=<JWT>` - Launch game frontend with a JWT passed via query string
- `GET /games/:gameId/assets/*` - Static assets

### API Routes

- `GET /api/v1/games` - List all games
- `GET /api/v1/games/:gameId` - Get game details
- `POST /api/v1/games/:gameId/bet` - Place bet (proxied)
- `GET /api/v1/games/:gameId/health` - Check game health
- `GET /api/v1/games/:gameId/metrics` - Get game metrics
- `GET /health` - Gateway health + all games

## Deployment

### Production Environment

```bash
GATEWAY_PORT=3000
GATEWAY_BASE_URL=https://games-api.example.com
DICE_API_URL=https://dice-api.example.com
DICE_FRONTEND_URL=https://cdn.example.com/dice/v1.2.3/index.html
FRONTEND_ORIGIN=https://games.example.com
```

### Benefits

- ✅ Single entry point for all games
- ✅ Centralized CORS handling
- ✅ Easy SSL/certificate management
- ✅ Centralized monitoring
- ✅ Simple load balancing

## Benefits

### For Frontend Developers
- No backend URLs to hardcode
- Single entry point
- CORS handled automatically
- Consistent API pattern

### For Backend Developers
- Service isolation
- No CORS code needed
- Easy scaling

### For Operations
- Single deployment point
- Centralized monitoring
- Easy SSL setup
- Simple load balancing

## Testing

See [External Frontend Example](../examples/external-frontend/README.md) for complete testing setup with example frontend.

## Next Steps

- **[Getting Started](./GETTING_STARTED.md)** - Run games locally
- **[External Frontend Example](../examples/external-frontend/README.md)** - Example external frontend
- **[Production Guide](./PRODUCTION.md)** - Production deployment

