# CoinFlip API

Single-step HTTP implementation of CoinFlip built on `GameBetRunner`. Every bet flows through the same path as Dice: validate → risk → provably-fair RNG → math evaluation → wallet debit/credit → ledger/history logging → response. No WebSockets or Redis round blobs are involved.

## Endpoints

### `POST /coinflip/bet`

Headers:

- `Authorization: Bearer <JWT>` – must include `operatorId`, `userId`, `currency`, `mode` (`demo|real`).
- `x-idempotency-key` – required; identical requests with the same key return cached results with no extra debits.

Body:

```jsonc
{
  "betAmount": "10000",   // positive integer string (minor units)
  "side": "heads",        // heads | tails (case-insensitive)
  "clientSeed": "optional-custom-seed"
}
```

Response:

```jsonc
{
  "roundId": "uuid",
  "betAmount": "10000",
  "payoutAmount": "20000",
  "currency": "USD",
  "pickedSide": "HEADS",
  "outcome": "HEADS",
  "isWin": true,
  "winAmount": 20000,
  "payoutMultiplier": 2,
  "serverSeedHash": "…",
  "clientSeed": "…",
  "nonce": 42,
  "mathVersion": "v1",
  "createdAt": "2025-11-30T00:00:00.000Z"
}
```

### `GET /coinflip/health`

Probes Postgres (`SELECT 1`), Redis (set/delete), and the configured wallet adapter (balance lookup against a scoped probe user). Returns `{ "status": "ok", "checks": { ... } }` or `503` with failing checks.

### `GET /metrics`

Prometheus exposition endpoint backed by `prom-client`. Exposes both platform-wide metrics and CoinFlip-specific counters (e.g., `coinflip_bets_total`, `coinflip_wins_total`, `coinflip_losses_total`, `coinflip_bet_amount`, `coinflip_payout_ratio`). Label set: `game`, `operatorId`, `currency`, `mode`, and `outcome` where applicable.

## Flow Guarantees

- **One-shot HTTP** – each bet is fully settled within the request lifecycle; there is no persistent round state outside history/ledger rows.
- **Provably Fair** – `ProvablyFairRngService` + `RedisProvablyFairStateStore` issue exactly one RNG draw per bet. Responses include `serverSeedHash`, `clientSeed`, and `nonce` so results can be recomputed.
- **Money safety** – `GameBetRunner` handles wallet interactions: `debitIfSufficient` once per bet, `credit` once per win, automatic refunds if anything fails post-debit, and ledger entries for both bet and payout/refund legs.
- **History + audit** – `GameRoundRepository` stores every round with bet amount, payout, math version, PF metadata, and evaluation metadata (`side`, `outcome`, `win`, `multiplier`). Ledger writes mirror wallet movements.
- **Idempotency** – repeating `POST /coinflip/bet` with the same `x-idempotency-key` returns the cached result for 60 seconds and never performs a second debit. Colliding in-flight requests yield `409 Conflict`.
- **Redis usage** – limited to provably-fair context (seeds + nonce), idempotency cache, and demo-wallet balances. There are no keys such as `coinflip:round:{userId}`.

## Configuration

- Game config (`game_configs`) controls `minBet`, `maxBet`, `maxPayout`, `mathVersion`, and optional math extras (`houseEdge`, `maxMultiplier`). Values are cached in Redis and invalidated automatically via the game test harness.
- Wallet implementation is selected via `WALLET_IMPL` (demo or db) at bootstrap by `WalletRouter`. Real-money mode requires `db`.
- Default health currency can be overridden with `COINFLIP_HEALTH_CURRENCY` if an operator funds balances in another ISO code.

## Testing

- `pnpm vitest packages/game-math-coinflip` – deterministic math engine coverage (payouts, RTP simulation, validation).
- `pnpm vitest apps/coinflip-api` – HTTP flow tests (win, loss, idempotency, validation failure, health checks) plus shared `registerGameE2ESuite` coverage for risk gating & mode enforcement.

With these guarantees, CoinFlip meets the same standard as Dice/Hi-Lo: GLI-friendly logging, provably-fair RNG, wallet safety, and HTTP-only orchestration.*** End Patch to=functions.apply_patch

