import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AuthModule, AUTH_PORT, DummyAuthPort } from "@instant-games/core-auth";
import { DbModule, DB_CLIENT } from "@instant-games/core-db";
import { RedisModule, KEY_VALUE_STORE, LOCK_MANAGER } from "@instant-games/core-redis";
import { LoggingModule, LOGGER, CorrelationIdInterceptor } from "@instant-games/core-logging";
import { MetricsModule, METRICS } from "@instant-games/core-metrics";
import { ProvablyFairService, PROVABLY_FAIR_SERVICE, PROVABLY_FAIR_STATE_STORE, RedisProvablyFairStateStore } from "@instant-games/core-provably-fair";
import { ProvablyFairRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { DbGameConfigService, GAME_CONFIG_SERVICE } from "@instant-games/core-config";
import { GameRoundRepository, GAME_ROUND_REPOSITORY } from "@instant-games/core-game-history";
import { WalletTransactionRepository, WALLET_TRANSACTION_REPOSITORY } from "@instant-games/core-ledger";
import { DemoWalletService, WalletRouter, DEMO_WALLET, WALLET_ROUTER } from "@instant-games/core-wallet";
import { RedisIdempotencyStore, IDEMPOTENCY_STORE } from "@instant-games/core-idempotency";
import { RiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { NoopBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { DiceController } from "./dice.controller";
import { DiceService } from "./dice.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule.forRoot(),
    RedisModule.forRoot(),
    AuthModule,
    LoggingModule,
    MetricsModule,
  ],
  controllers: [DiceController],
  providers: [
    DiceService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
    { provide: AUTH_PORT, useClass: DummyAuthPort },
    { provide: PROVABLY_FAIR_SERVICE, useClass: ProvablyFairService },
    {
      provide: PROVABLY_FAIR_STATE_STORE,
      inject: [KEY_VALUE_STORE, PROVABLY_FAIR_SERVICE],
      useFactory: (kv, pf) => new RedisProvablyFairStateStore(kv, pf),
    },
    {
      provide: RNG_SERVICE,
      inject: [PROVABLY_FAIR_SERVICE],
      useFactory: (pf) => new ProvablyFairRngService(pf),
    },
    {
      provide: GAME_CONFIG_SERVICE,
      inject: [DB_CLIENT, KEY_VALUE_STORE],
      useFactory: (db, kv) => new DbGameConfigService(db, kv),
    },
    {
      provide: GAME_ROUND_REPOSITORY,
      inject: [DB_CLIENT],
      useFactory: (db) => new GameRoundRepository(db),
    },
    {
      provide: WALLET_TRANSACTION_REPOSITORY,
      inject: [DB_CLIENT],
      useFactory: (db) => new WalletTransactionRepository(db),
    },
    {
      provide: DEMO_WALLET,
      inject: [KEY_VALUE_STORE, LOCK_MANAGER],
      useFactory: (kv, lock) => new DemoWalletService(kv, lock),
    },
    {
      provide: WALLET_ROUTER,
      inject: [DEMO_WALLET],
      useFactory: (demoWallet) => new WalletRouter(demoWallet),
    },
    {
      provide: IDEMPOTENCY_STORE,
      inject: [KEY_VALUE_STORE],
      useFactory: (kv) => new RedisIdempotencyStore(kv),
    },
    {
      provide: RISK_SERVICE,
      inject: [GAME_CONFIG_SERVICE, KEY_VALUE_STORE],
      useFactory: (cfgService, kv) => new RiskService(cfgService, kv),
    },
    { provide: BONUS_PORT, useClass: NoopBonusPort },
  ],
})
export class AppModule {}
