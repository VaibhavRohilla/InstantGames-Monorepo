# Simulator CLI Guide - Testing All Games

The simulator CLI allows you to test game math engines without needing the full API stack. Currently, **only dice is implemented**. This guide shows you how to test dice and how to add support for other games.

## Currently Supported Games

### ✅ Dice

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
  "condition": "under"
}
```

## Available Games (Need Implementation)

The following games have math engines available but aren't yet implemented in the simulator:

### 1. **CoinFlip** (`game-math-coinflip`)
- Simple heads/tails game
- Parameters needed: `choice` ("heads" or "tails")

### 2. **Roulette** (`game-math-roulette`)
- Number selection game
- Parameters needed: `selection` (0-9)

### 3. **Mines** (`game-math-mines`)
- Cell reveal game
- Parameters needed: `cell` (cell index)

### 4. **Hilo** (`game-math-hilo`)
- Card prediction game
- Parameters needed: `currentCard`, `choice` ("higher" or "lower")

### 5. **Plinko** (`game-math-plinko`)
- Ball drop game
- Parameters needed: None (auto-calculated)

### 6. **Wheel** (`game-math-wheel`)
- Wheel spin game
- Parameters needed: None (auto-calculated)

### 7. **Keno** (`game-math-keno`)
- Number picking game
- Parameters needed: `picks` (array of numbers)

## Adding Support for More Games

To add support for a new game in the simulator:

1. **Update `package.json`** to include the game math dependency:
```json
{
  "dependencies": {
    "@instant-games/game-math-dice": "workspace:*",
    "@instant-games/game-math-coinflip": "workspace:*",
    // ... add more
  }
}
```

2. **Import the math engine** in `main.ts`:
```typescript
import { CoinFlipMathEngine } from "@instant-games/game-math-coinflip";
```

3. **Add simulation function** similar to `runDiceSim()`:
```typescript
async function runCoinFlipSim(options: CoinFlipSimOptions) {
  const engine = new CoinFlipMathEngine();
  // ... run simulations
}
```

4. **Add to switch statement**:
```typescript
case "coinflip": {
  const options = { ... };
  await runCoinFlipSim(options);
  break;
}
```

## Example: CoinFlip Implementation

Here's how you could add CoinFlip support:

```typescript
// In main.ts

import { CoinFlipMathEngine } from "@instant-games/game-math-coinflip";

interface CoinFlipSimOptions {
  rounds: number;
  bet: bigint;
  choice: "heads" | "tails";
}

async function runCoinFlipSim(options: CoinFlipSimOptions) {
  const engine = new CoinFlipMathEngine();
  
  let totalBet = BigInt(0);
  let totalPayout = BigInt(0);
  let wins = 0;
  
  for (let i = 0; i < options.rounds; i++) {
    const roll = randomInt(0, 2); // 0 or 1
    const rngValue = roll;
    const result = engine.evaluate({
      ctx: SIM_CONTEXT,
      betAmount: options.bet,
      payload: { choice: options.choice },
      rng: () => rngValue / 1.0,
    });
    
    totalBet += options.bet;
    totalPayout += result.payout;
    if (result.metadata.win === true) wins += 1;
  }
  
  const rtp = Number(totalPayout * BigInt(10000) / (totalBet === BigInt(0) ? BigInt(1) : totalBet)) / 100;
  
  console.log(JSON.stringify({
    game: "coinflip",
    rounds: options.rounds,
    totalBet: totalBet.toString(),
    totalPayout: totalPayout.toString(),
    rtp,
    winRate: wins / options.rounds,
    choice: options.choice,
  }, null, 2));
}

// In switch statement:
case "coinflip": {
  const options: CoinFlipSimOptions = {
    rounds: Number(args.rounds ?? 1000),
    bet: BigInt(args.bet ?? "100"),
    choice: (args.choice as "heads" | "tails") ?? "heads",
  };
  await runCoinFlipSim(options);
  break;
}
```

Then you could run:
```bash
pnpm --filter @instant-games/simulator-cli start:dev -- coinflip \
  --rounds 10000 \
  --bet 1000 \
  --choice heads
```

## Testing Workflow

1. **Test with simulator CLI** (no DB/Redis needed):
   ```bash
   pnpm --filter @instant-games/simulator-cli start:dev -- dice --rounds 100000 --bet 1000 --target 50 --condition under
   ```

2. **Check RTP** - Should match expected value based on house edge

3. **Test different parameters** - Try various configurations

4. **Run full API tests** - Once simulator looks good, test via API

## Tips

- **High rounds** (100,000+) give more accurate RTP measurements
- **Different targets/parameters** test edge cases
- **Compare RTP** across different house edge values
- **Check win rates** match expected probabilities

## Next Steps

To test other games, you'll need to:
1. Implement simulation functions for each game (similar to dice)
2. Add command-line argument parsing for each game's parameters
3. Update the switch statement to handle all games
4. Test thoroughly with various parameter combinations

Currently, **only dice is fully implemented** in the simulator CLI.

