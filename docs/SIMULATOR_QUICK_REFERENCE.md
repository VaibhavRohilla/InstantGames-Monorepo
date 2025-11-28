# Simulator CLI - Quick Reference

## All Games - One Line Commands

### Dice
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 10000 --bet 1000 --target 50 --condition under --houseEdge 1
```

### CoinFlip
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- coinflip --rounds 10000 --bet 1000 --choice heads
```

### Roulette
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- roulette --rounds 10000 --bet 1000 --selection 5
```

### Mines
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- mines --rounds 10000 --bet 1000 --cell 0
```

### Hilo
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- hilo --rounds 10000 --bet 1000 --currentCard 7 --choice higher
```

### Plinko
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- plinko --rounds 10000 --bet 1000
```

### Wheel
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- wheel --rounds 10000 --bet 1000
```

### Keno
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- keno --rounds 10000 --bet 1000 --picks 1,2,3,4,5
```

## Parameter Reference

### Common Parameters (All Games)
- `--rounds`: Number of simulation rounds (default: 1000)
- `--bet`: Bet amount per round (default: 100)

### Game-Specific Parameters

#### Dice
- `--target`: Target number 2-98 (default: 50)
- `--condition`: "over" or "under" (default: "under")
- `--houseEdge`: House edge percentage (default: 1)

#### CoinFlip
- `--choice`: "heads" or "tails" (default: "heads")

#### Roulette
- `--selection`: Number 0-9 (default: 0)

#### Mines
- `--cell`: Cell index to reveal (default: 0)

#### Hilo
- `--currentCard`: Current card value 1-13 (default: 7)
- `--choice`: "higher" or "lower" (default: "higher")

#### Plinko
- (No additional parameters)

#### Wheel
- (No additional parameters)

#### Keno
- `--picks`: Comma-separated numbers (default: "1,2,3,4,5")

## Tips

1. **For accurate RTP**: Use 100,000+ rounds
2. **For quick tests**: Use 1,000 rounds
3. **Dice is production-ready**: Other games use stub implementations
4. **Compare results**: Run multiple times to see variance

## Example: Test All Games Quickly

```bash
# Test all games with 1,000 rounds each
pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 1000 --bet 1000 --target 50 --condition under
pnpm --filter @instant-games/simulator-cli start:dev -- coinflip --rounds 1000 --bet 1000 --choice heads
pnpm --filter @instant-games/simulator-cli start:dev -- roulette --rounds 1000 --bet 1000 --selection 5
pnpm --filter @instant-games/simulator-cli start:dev -- mines --rounds 1000 --bet 1000 --cell 0
pnpm --filter @instant-games/simulator-cli start:dev -- hilo --rounds 1000 --bet 1000 --currentCard 7 --choice higher
pnpm --filter @instant-games/simulator-cli start:dev -- plinko --rounds 1000 --bet 1000
pnpm --filter @instant-games/simulator-cli start:dev -- wheel --rounds 1000 --bet 1000
pnpm --filter @instant-games/simulator-cli start:dev -- keno --rounds 1000 --bet 1000 --picks 1,2,3,4,5
```

For detailed information, see `docs/TESTING_ALL_GAMES.md`.

