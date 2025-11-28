# Simulator CLI - Complete Guide

The Simulator CLI allows you to test game math engines and RTP (Return to Player) without needing the full API stack.

## Quick Reference

### All Games - One Line Commands

```bash
# Dice
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 10000 --bet 1000 --target 50 --condition under --houseEdge 1

# CoinFlip
pnpm --filter @instant-games/simulator-cli start:dev -- coinflip --rounds 10000 --bet 1000 --choice heads

# Roulette
pnpm --filter @instant-games/simulator-cli start:dev -- roulette --rounds 10000 --bet 1000 --selection 5

# Mines
pnpm --filter @instant-games/simulator-cli start:dev -- mines --rounds 10000 --bet 1000 --cell 0

# Hilo
pnpm --filter @instant-games/simulator-cli start:dev -- hilo --rounds 10000 --bet 1000 --currentCard 7 --choice higher

# Plinko
pnpm --filter @instant-games/simulator-cli start:dev -- plinko --rounds 10000 --bet 1000

# Wheel
pnpm --filter @instant-games/simulator-cli start:dev -- wheel --rounds 10000 --bet 1000

# Keno
pnpm --filter @instant-games/simulator-cli start:dev -- keno --rounds 10000 --bet 1000 --picks 1,2,3,4,5
```

## Available Games

### 1. Dice ✅ Production-Ready

Predict if the roll will be over or under a target number.

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)
- `--target`: Target number 2-98 (default: 50)
- `--condition`: "over" or "under" (default: "under")
- `--houseEdge`: House edge percentage (default: 1)

**Example:**
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 10000 \
  --bet 1000 \
  --target 50 \
  --condition under \
  --houseEdge 1
```

**Output:**
```json
{
  "game": "dice",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "9900000",
  "rtp": 99.0,
  "winRate": 0.495,
  "target": 50,
  "condition": "under"
}
```

### 2. CoinFlip

Simple heads or tails game.

**Parameters:**
- `--choice`: "heads" or "tails" (default: "heads")

### 3. Roulette

Pick a number 0-9 to win.

**Parameters:**
- `--selection`: Number 0-9 (default: 0)

### 4. Mines

Cell reveal game.

**Parameters:**
- `--cell`: Cell index to reveal (default: 0)

### 5. Hilo

Card prediction (higher/lower).

**Parameters:**
- `--currentCard`: Current card value 1-13 (default: 7)
- `--choice`: "higher" or "lower" (default: "higher")

### 6. Plinko

Ball drop game (no additional parameters).

### 7. Wheel

Wheel spin game (no additional parameters).

### 8. Keno

Number picking game.

**Parameters:**
- `--picks`: Comma-separated numbers (default: "1,2,3,4,5")

## Common Parameters

All games support:
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)

## Tips

1. **For accurate RTP**: Use 100,000+ rounds
2. **For quick tests**: Use 1,000 rounds
3. **Dice is production-ready**: Other games may use stub implementations
4. **Compare results**: Run multiple times to see variance

## Understanding RTP

RTP (Return to Player) = Total Payout / Total Bet

- **99% RTP** = Player gets back 99% of bets long-term
- **House Edge** = 100% - RTP (1% house edge = 99% RTP)

### Changing RTP

Use `--houseEdge` parameter:

```bash
# 95% RTP (5% house edge)
--houseEdge 5

# 90% RTP (10% house edge)
--houseEdge 10

# 99.5% RTP (0.5% house edge)
--houseEdge 0.5
```

See [Reference Guide](./REFERENCE.md#changing-rtp) for more details on changing RTP.

## Example: Test All Games

```bash
# Quick test all games with 1,000 rounds each
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 1000 --bet 1000 --target 50 --condition under
pnpm --filter @instant-games/simulator-cli start:dev -- coinflip --rounds 1000 --bet 1000 --choice heads
pnpm --filter @instant-games/simulator-cli start:dev -- roulette --rounds 1000 --bet 1000 --selection 5
pnpm --filter @instant-games/simulator-cli start:dev -- mines --rounds 1000 --bet 1000 --cell 0
pnpm --filter @instant-games/simulator-cli start:dev -- hilo --rounds 1000 --bet 1000 --currentCard 7 --choice higher
pnpm --filter @instant-games/simulator-cli start:dev -- plinko --rounds 1000 --bet 1000
pnpm --filter @instant-games/simulator-cli start:dev -- wheel --rounds 1000 --bet 1000
pnpm --filter @instant-games/simulator-cli start:dev -- keno --rounds 1000 --bet 1000 --picks 1,2,3,4,5
```

## Production Status

**Note:** Currently, only **Dice** has a production-ready math implementation. Other games use stub implementations for prototyping only.

See [Production Guide](./PRODUCTION.md) for details.

## Next Steps

- **[Getting Started](./GETTING_STARTED.md)** - Run games via API
- **[Changing RTP](./REFERENCE.md#changing-rtp)** - Adjust game RTP
- **[Production Guide](./PRODUCTION.md)** - Production deployment

