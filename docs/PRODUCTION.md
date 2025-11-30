# Production Readiness Guide

Complete assessment of production readiness for games, wallet, and RNG certification.

## Game Production Status

| Game      | Production Ready? | RNG Certified Ready? | Notes                                                               |
|--------------|---------------|----------------------|----------------------------------------------------------------------|
| **Dice**     | ✅ **YES**    | ✅ **YES**          | Full implementation with proper math, house edge, validation         |
| **CoinFlip** | ✅ **YES**    |  ✅ **YES**         |  Full implementation with proper math, house edge, validation        |
| **Roulette** | ❌ NO         | ⚠️ Partially        | Stub implementation - needs proper math                              |
| **Mines**    | ❌ NO         | ⚠️ Partially        | Stub implementation - needs proper math                              |
| **Hilo**     | ✅ **YES**    | ✅ **YES**          | Multi-step orchestration with PF deck, wallet safety, Redis state    |
| **Plinko**   | ❌ NO         | ⚠️ Partially        | Stub implementation - needs proper math                              |
| **Wheel**    | ❌ NO         | ⚠️ Partially        | Stub implementation - needs proper math                              |
| **Keno**     | ❌ NO         | ⚠️ Partially        | Stub implementation - needs proper math                              |

## Dice (Production-Ready ✅)

### Why it's Production-Ready

1. ✅ **Proper Math Implementation**
   - Correct probability calculations
   - House edge support (configurable)
   - Validated multipliers
   - Input validation

2. ✅ **Provably Fair Integration**
   - Uses provably fair RNG system
   - Proper nonce tracking
   - Seed rotation support
   - Full audit trail

3. ✅ **Test Coverage**
   - Unit tests for math engine
   - E2E tests for API
   - Integration tests

4. ✅ **Documentation**
   - Clear interfaces
   - Type safety
   - Error handling

## Core Wallet - Production Status

**Status: ✅ Production-Grade (with configuration requirements)**

### DbWalletService (Real-Money Wallet) ✅

**Production Status: ✅ READY**

#### Strengths:

1. **✅ Database Persistence**
   - PostgreSQL as source of truth
   - Proper schema with constraints
   - Balance stored as `NUMERIC(36, 0)` for precision
   - Unique constraint on `(operator_id, user_id, currency, mode)`

2. **✅ Concurrency Safety**
   - Redis distributed locks prevent cross-instance race conditions
   - PostgreSQL `FOR UPDATE` ensures row-level locking
   - Database transactions ensure atomicity
   - Double-layer protection: Redis locks + Postgres transactions

3. **✅ Balance Protection**
   - `debitIfSufficient()` validates balance before debiting
   - Throws `INSUFFICIENT_FUNDS` error if balance < amount
   - Test coverage for concurrent overdraft prevention

4. **✅ Multi-Tenant Isolation**
   - Operator-scoped wallet keys
   - Prevents cross-operator balance access
   - Test coverage for operator isolation

5. **✅ Idempotency Support**
   - Works with idempotency store
   - Prevents duplicate transactions

#### Configuration Requirements:

**⚠️ CRITICAL:** Must set `WALLET_IMPL=db` in production!

```bash
WALLET_IMPL=db  # NOT "demo"
```

If not set correctly, the system will silently fall back to demo wallet (Redis-only, non-persistent).

### DemoWalletService (Play-Money Wallet) ✅

**Production Status: ✅ READY (for demo/play-money only)**

- ✅ Redis-based storage
- ✅ Concurrency safe with Redis locks
- ✅ Suitable for demo/play-money games
- ❌ **NOT suitable for real-money transactions**

## Provably Fair RNG - Production Status

**Status: ✅ Production-Ready and Certifiable**

### Features

1. **✅ Cryptographic Security**
   - HMAC-SHA256 for deterministic randomness
   - Server seed generation with secure random
   - Client seed integration
   - Nonce-based rolling

2. **✅ Audit Trail**
   - All seeds stored in database
   - Round history with nonce tracking
   - Verifiable results

3. **✅ Seed Rotation**
   - Automatic seed rotation support
   - Configurable rotation intervals
   - Prevents seed reuse

4. **✅ Certifiable**
   - Follows industry standards
   - Full audit capability
   - Transparent verification

## Production Checklist

### Before Going to Production

- [ ] Set `WALLET_IMPL=db` for real-money transactions
- [ ] Configure JWT signing keys (`AUTH_JWT_ALGO`, secret/public key, issuer, audience)
- [ ] Set up JWT key management (RS256 recommended)
- [ ] Configure database connection pooling
- [ ] Set up Redis clustering for high availability
- [ ] Enable SSL/TLS for all connections
- [ ] Configure proper logging and monitoring
- [ ] Set up backup and disaster recovery
- [ ] Perform security audit
- [ ] Load testing
- [ ] RNG certification (if required)

### Environment Variables

```bash
# Critical for production
WALLET_IMPL=db  # NOT "demo"

# Authentication (JWT only)
AUTH_JWT_ALGO=RS256             # RS256 recommended
AUTH_JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
AUTH_JWT_ISSUER=https://operator.example.com
AUTH_JWT_AUDIENCE=instant-games-platform
# For HS256 environments:
# AUTH_JWT_SECRET=super-secret-value

# Database
DATABASE_URL=postgres://user:pass@host:5432/db
DB_MAX_CONNECTIONS=20

# Redis
REDIS_URL=redis://host:6379
REDIS_KEY_PREFIX=prod:

# Logging
LOG_LEVEL=info  # or warn for production

# Monitoring
METRICS_DISABLED=false
```

## Authentication

### JWT Mode (Production)

For production, use JWT-based authentication instead of header-based dev mode.

**Configuration:**

1. **Choose algorithm and provide keys:**

   **Option A: RS256 (Recommended for production)**
   ```bash
   AUTH_JWT_ALGO=RS256
   AUTH_JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
   ...
   -----END PUBLIC KEY-----
   ```
   Or base64-encoded:
   ```bash
   AUTH_JWT_PUBLIC_KEY=LS0tLS1CRUdJTi...
   ```

   **Option B: HS256 (Simpler, but shared secret)**
   ```bash
   AUTH_JWT_ALGO=HS256
   AUTH_JWT_SECRET=your-secret-key-here
   ```

**JWT Token Requirements:**

JWTs must include the following claims:

- `sub` or `userId`: User identifier (string, required)
- `operatorId`: Operator identifier (string, required)
- `currency`: Currency code (string, required)
- `mode`: Game mode "demo" | "real" (string, required)
- `exp`: Token expiration (number, required)
- `nbf`: Not before (number, optional)

**Optional claims:**
- `brandId`: Brand identifier
- `country`: Country code
- `isTestUser`: Test user flag
- Additional claims are included in `metadata`

**Example JWT Payload:**
```json
{
  "sub": "user123",
  "operatorId": "operator1",
  "currency": "USD",
  "mode": "real",
  "brandId": "brand1",
  "country": "US",
  "exp": 1234567890,
  "iat": 1234567890
}
```

**Usage:**
```bash
curl -X POST https://api.example.com/api/v1/games/dice/bet \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "x-idempotency-key: ..." \
  -d '{...}'
```

**Security Notes:**
- ✅ Use RS256 for production (asymmetric keys)
- ✅ Keep private keys secure (never commit to code)
- ✅ Set appropriate token expiration times
- ✅ Rotate keys periodically
- ✅ Use HTTPS in production
- ❌ Never use dev-header mode in production

For generating dev tokens locally, follow the steps in [Getting Started](./GETTING_STARTED.md#authentication-jwt-for-demo--production).

### Database Setup

- Use PostgreSQL connection pooling (pgBouncer)
- Configure appropriate `DB_MAX_CONNECTIONS`
- Set up read replicas for scalability
- Regular backups
- Monitor connection pool usage

### Redis Setup

- Redis cluster for high availability
- Persistent storage (AOF + RDB)
- Memory monitoring
- Key expiration policies

## Production Recommendations

1. **Start with Dice** - Only production-ready game
2. **Use DbWalletService** - For real-money transactions
3. **Monitor closely** - Track RTP, wallet balances, errors
4. **Gradual rollout** - Start with demo mode, then real-money
5. **Test thoroughly** - Load testing, security audit

## RNG Certification

The Provably Fair RNG system is ready for certification:
- ✅ Cryptographically secure
- ✅ Full audit trail
- ✅ Transparent verification
- ✅ Industry-standard implementation

## Next Steps

- **[Getting Started](./GETTING_STARTED.md)** - Local setup
- **[Reference Guide](./REFERENCE.md)** - Configuration details
- **[Gateway Guide](./GATEWAY.md)** - Production gateway setup

