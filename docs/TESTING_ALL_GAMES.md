# Testing All Games with Simulator CLI

The simulator CLI now supports **all 8 games** in the monorepo! This guide shows you how to test each one.

## Quick Start

**Basic command format:**
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- <game> [options]
```

## Available Games

1. **Dice** - Target-based prediction game
2. **CoinFlip** - Heads or tails
3. **Roulette** - Number selection (0-9)
4. **Mines** - Cell reveal game
5. **Hilo** - Card prediction (higher/lower)
6. **Plinko** - Ball drop game
7. **Wheel** - Wheel spin game
8. **Keno** - Number picking game

---

## 1. Dice

Predict if the roll will be over or under a target number.

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice \
  --rounds 10000 \
  --bet 1000 \
  --target 50 \
  --condition under \
  --houseEdge 1
```

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)
- `--target`: Target number 2-98 (default: 50)
- `--condition`: "over" or "under" (default: "under")
- `--houseEdge`: House edge percentage (default: 1)

**Example Output:**
```json
{
  "game": "dice",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "9900000",
  "rtp": 99.0,
  "winRate": 0.495,
  "target": 50,
  "condition": "under",
  "houseEdge": 1
}
```

---

## 2. CoinFlip

Simple heads or tails game.

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- coinflip \
  --rounds 10000 \
  --bet 1000 \
  --choice heads
```

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)
- `--choice`: "heads" or "tails" (default: "heads")

**Example Output:**
```json
{
  "game": "coinflip",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "10000000",
  "rtp": 100.0,
  "winRate": 0.5,
  "choice": "heads"
}
```

---

## 3. Roulette

Pick a number 0-9 to win.

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- roulette \
  --rounds 10000 \
  --bet 1000 \
  --selection 5
```

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)
- `--selection`: Number 0-9 (default: 0)

**Example Output:**
```json
{
  "game": "roulette",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "10000000",
  "rtp": 100.0,
  "winRate": 0.1,
  "selection": 5
}
```

---

## 4. Mines

Reveal a cell and avoid mines.

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- mines \
  --rounds 10000 \
  --bet 1000 \
  --cell 0
```

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)
- `--cell`: Cell index to reveal (default: 0)

**Example Output:**
```json
{
  "game": "mines",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "7500000",
  "rtp": 75.0,
  "winRate": 0.25,
  "cell": 0
}
```

---

## 5. Hilo

Predict if the next card is higher or lower.

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- hilo \
  --rounds 10000 \
  --bet 1000 \
  --currentCard 7 \
  --choice higher
```

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)
- `--currentCard`: Current card value 1-13 (default: 7)
- `--choice`: "higher" or "lower" (default: "higher")

**Example Output:**
```json
{
  "game": "hilo",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "10000000",
  "rtp": 100.0,
  "winRate": 0.5,
  "currentCard": 7,
  "choice": "higher"
}
```

---

## 6. Plinko

Drop a ball and see where it lands.

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- plinko \
  --rounds 10000 \
  --bet 1000
```

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)

**Example Output:**
```json
{
  "game": "plinko",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "8500000",
  "rtp": 85.0,
  "winRate": 0.6
}
```

---

## 7. Wheel

Spin the wheel and hope for a win.

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- wheel \
  --rounds 10000 \
  --bet 1000
```

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)

**Example Output:**
```json
{
  "game": "wheel",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "6666666",
  "rtp": 66.67,
  "winRate": 0.3333
}
```

---

## 8. Keno

Pick numbers and hope they match.

```bash
pnpm --filter @instant-games/simulator-cli start:dev -- keno \
  --rounds 10000 \
  --bet 1000 \
  --picks 1,2,3,4,5
```

**Parameters:**
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)
- `--picks`: Comma-separated numbers (default: "1,2,3,4,5")

**Example Output:**
```json
{
  "game": "keno",
  "rounds": 10000,
  "totalBet": "10000000",
  "totalPayout": "4500000",
  "rtp": 45.0,
  "winRate": 0.15,
  "picks": [1, 2, 3, 4, 5]
}
```

---

## Quick Test Commands

### Test All Games (Quick)
```bash
# Dice
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 1000 --bet 1000 --target 50 --condition under

# CoinFlip
pnpm --filter @instant-games/simulator-cli start:dev -- coinflip --rounds 1000 --bet 1000 --choice heads

# Roulette
pnpm --filter @instant-games/simulator-cli start:dev -- roulette --rounds 1000 --bet 1000 --selection 5

# Mines
pnpm --filter @instant-games/simulator-cli start:dev -- mines --rounds 1000 --bet 1000 --cell 0

# Hilo
pnpm --filter @instant-games/simulator-cli start:dev -- hilo --rounds 1000 --bet 1000 --currentCard 7 --choice higher

# Plinko
pnpm --filter @instant-games/simulator-cli start:dev -- plinko --rounds 1000 --bet 1000

# Wheel
pnpm --filter @instant-games/simulator-cli start:dev -- wheel --rounds 1000 --bet 1000

# Keno
pnpm --filter @instant-games/simulator-cli start:dev -- keno --rounds 1000 --bet 1000 --picks 1,2,3,4,5
```

### Test All Games (Accurate RTP)
```bash
# Use 100,000+ rounds for accurate RTP measurement

# Dice
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 100000 --bet 1000 --target 50 --condition under --houseEdge 1

# CoinFlip
pnpm --filter @instant-games/simulator-cli start:dev -- coinflip --rounds 100000 --bet 1000 --choice heads

# Roulette
pnpm --filter @instant-games/simulator-cli start:dev -- roulette --rounds 100000 --bet 1000 --selection 5

# Mines
pnpm --filter @instant-games/simulator-cli start:dev -- mines --rounds 100000 --bet 1000 --cell 0

# Hilo
pnpm --filter @instant-games/simulator-cli start:dev -- hilo --rounds 100000 --bet 1000 --currentCard 7 --choice higher

# Plinko
pnpm --filter @instant-games/simulator-cli start:dev -- plinko --rounds 100000 --bet 1000

# Wheel
pnpm --filter @instant-games/simulator-cli start:dev -- wheel --rounds 100000 --bet 1000

# Keno
pnpm --filter @instant-games/simulator-cli start:dev -- keno --rounds 100000 --bet 1000 --picks 1,2,3,4,5
```

---

## Understanding the Output

Each simulation outputs JSON with:

- **`game`**: Game name
- **`rounds`**: Number of rounds simulated
- **`totalBet`**: Total amount bet
- **`totalPayout`**: Total amount paid out
- **`rtp`**: Return to Player percentage (totalPayout / totalBet × 100)
- **`winRate`**: Percentage of rounds that won
- **Game-specific parameters**: Varies by game

### What to Look For

1. **RTP** - Should match expected value (depends on game math)
2. **Win Rate** - Should match expected probability
3. **Consistency** - Run multiple times to see variance

---

## Notes

⚠️ **Important**: Most games use stub implementations (not production-ready math). Only Dice has full math implementation.

- Dice: ✅ Full implementation with house edge
- Other games: ⚠️ Stub implementations for prototyping

The stub games will have RTP that varies, as they're simplified versions for testing the API structure.

---

## Troubleshooting

### "Unsupported game" error
- Make sure you typed the game name correctly
- Check available games: `dice`, `coinflip`, `roulette`, `mines`, `hilo`, `plinko`, `wheel`, `keno`

### Dependencies not found
- Run `pnpm install` to install all game math packages
- The simulator CLI now depends on all game-math packages

### Build errors
- Run `pnpm build` first to build all packages
- Or run in dev mode: `start:dev` (doesn't require build)

---

## Next Steps

1. **Test each game** with different parameters
2. **Compare RTP** across different configurations
3. **Run high rounds** (100,000+) for accurate measurements
4. **Implement production math** for stub games if needed

