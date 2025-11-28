# How to Change RTP (Return to Player)

RTP is controlled by the **house edge**. The relationship is simple:

```
RTP = 100% - HouseEdge%

Examples:
- House Edge 1% → RTP 99%
- House Edge 5% → RTP 95%
- House Edge 0% → RTP 100% (fair game, no house edge)
- House Edge 10% → RTP 90%
```

## Method 1: Change RTP in Simulator CLI (Easy!)

The simulator CLI already supports a `--houseEdge` parameter. You can test different RTP values immediately!

### Lower RTP (Higher House Edge)

**Example: 95% RTP (5% house edge)**
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 10000 \
  --bet 1000 \
  --target 50 \
  --condition under \
  --houseEdge 5
```

Expected: RTP will be around **95%** (player gets back 95% of bets long-term)

**Example: 90% RTP (10% house edge)**
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 10000 \
  --bet 1000 \
  --target 50 \
  --condition under \
  --houseEdge 10
```

Expected: RTP will be around **90%** (player gets back 90% of bets long-term)

### Higher RTP (Lower House Edge)

**Example: 99.5% RTP (0.5% house edge)**
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 10000 \
  --bet 1000 \
  --target 50 \
  --condition under \
  --houseEdge 0.5
```

Expected: RTP will be around **99.5%** (player gets back 99.5% of bets long-term)

**Example: 100% RTP (0% house edge - fair game)**
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 10000 \
  --bet 1000 \
  --target 50 \
  --condition under \
  --houseEdge 0
```

Expected: RTP will be around **100%** (perfectly fair, no house advantage)

### Compare Different House Edges

Test the same configuration with different house edges:

```bash
# 1% house edge (99% RTP) - Default
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 100000 --bet 1000 --target 50 --condition under --houseEdge 1

# 5% house edge (95% RTP)
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 100000 --bet 1000 --target 50 --condition under --houseEdge 5

# 10% house edge (90% RTP)
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 100000 --bet 1000 --target 50 --condition under --houseEdge 10
```

You'll see the RTP decrease as house edge increases!

## Method 2: Change RTP in Dice API (Production)

For the actual API, the house edge is configured in the **game_configs** table in the database.

### Step 1: Find/Update Game Config in Database

The house edge is stored in the `extra` JSON field of the `game_configs` table:

```sql
-- View current config
SELECT 
  operator_id, 
  game, 
  currency, 
  mode,
  extra->>'houseEdge' as house_edge
FROM game_configs 
WHERE operator_id = 'demo-operator' 
  AND game = 'dice';

-- Update house edge to 5% (95% RTP)
UPDATE game_configs
SET extra = jsonb_set(
  COALESCE(extra, '{}'::jsonb),
  '{houseEdge}',
  '5'
)
WHERE operator_id = 'demo-operator' 
  AND game = 'dice' 
  AND currency = 'USD' 
  AND mode = 'demo';
```

### Step 2: Clear Redis Cache (Important!)

The config is cached in Redis. Clear it or restart the API:

```bash
# Clear Redis cache (if using Redis CLI)
redis-cli FLUSHDB

# Or restart the dice-api
pnpm --filter @instant-games/dice-api start:dev
```

### Step 3: Test the API

Make a bet request and observe the payout multiplier:

```bash
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

Check the `multiplier` in the response - it will be lower with higher house edge!

### Example: Different House Edges in Database

**95% RTP (5% house edge):**
```sql
UPDATE game_configs
SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{houseEdge}', '5')
WHERE operator_id = 'demo-operator' AND game = 'dice';
```

**90% RTP (10% house edge):**
```sql
UPDATE game_configs
SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{houseEdge}', '10')
WHERE operator_id = 'demo-operator' AND game = 'dice';
```

**99.5% RTP (0.5% house edge):**
```sql
UPDATE game_configs
SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{houseEdge}', '0.5')
WHERE operator_id = 'demo-operator' AND game = 'dice';
```

## How Multiplier Changes with House Edge

The multiplier formula includes house edge:

```typescript
multiplier = (1 - houseEdge/100) / probability
```

### Example: Target 50, Condition "under" (49% win probability)

| House Edge | RTP | Multiplier | Payout on 1000 bet |
|------------|-----|------------|-------------------|
| 0% | 100% | 2.0408x | 2,040.80 |
| 0.5% | 99.5% | 2.0306x | 2,030.60 |
| 1% | 99% | 2.0204x | 2,020.40 |
| 5% | 95% | 1.9388x | 1,938.80 |
| 10% | 90% | 1.8367x | 1,836.70 |

**Notice:** Higher house edge = lower multiplier = lower payouts

## Code Location

The house edge is read from config here:

```typescript
// apps/dice-api/src/dice.service.ts (line 73-81)
private buildMathConfig(extra: Record<string, unknown>, mathVersion: string): DiceMathConfig {
  const mathExtra = extra as Partial<Record<string, number>>;
  return {
    mathVersion,
    houseEdge: typeof mathExtra.houseEdge === "number" ? mathExtra.houseEdge : 1, // Default: 1%
    // ...
  };
}
```

## Best Practices

1. **Start with simulator** - Test different house edges using the CLI first
2. **Verify RTP** - Run many rounds (100,000+) to confirm expected RTP
3. **Update database** - Store house edge in `game_configs.extra.houseEdge`
4. **Clear cache** - Redis caches configs, clear or restart after changes
5. **Monitor metrics** - Track actual RTP in production to ensure it matches config

## Typical House Edge Values

| Industry | Typical House Edge | RTP | Use Case |
|----------|-------------------|-----|----------|
| Online Casino | 1-2% | 98-99% | Standard, competitive |
| Land Casino | 2-5% | 95-98% | Traditional, higher margins |
| Aggressive | 5-10% | 90-95% | High-profit, less competitive |
| Promotional | 0.5-1% | 99-99.5% | Marketing, player acquisition |
| Fair Game | 0% | 100% | Special events, provably fair demo |

## Testing RTP Changes

Run this to verify different house edges:

```bash
# Test 1% house edge (99% RTP)
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 1000000 --bet 1000 --target 50 --condition under --houseEdge 1

# Test 5% house edge (95% RTP)  
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 1000000 --bet 1000 --target 50 --condition under --houseEdge 5

# Test 10% house edge (90% RTP)
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 1000000 --bet 1000 --target 50 --condition under --houseEdge 10
```

Compare the `rtp` value in each result - it should match: 99%, 95%, 90%!

