import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "@instant-games/core-auth";
import { DbModule, DB_CLIENT } from "@instant-games/core-db";
import { RedisModule, KEY_VALUE_STORE, LOCK_MANAGER } from "@instant-games/core-redis";
import { LoggingModule, CorrelationIdInterceptor } from "@instant-games/core-logging";
import { MetricsModule } from "@instant-games/core-metrics";
import {
  ProvablyFairService,
  PROVABLY_FAIR_SERVICE,
  PROVABLY_FAIR_STATE_STORE,
  RedisProvablyFairStateStore,
  PfRotationService,
  PF_ROTATION_SERVICE,
} from "@instant-games/core-provably-fair";
import { ProvablyFairRngService, RNG_SERVICE } from "@instant-games/core-rng";
import { DbGameConfigService, GAME_CONFIG_SERVICE } from "@instant-games/core-config";
import { GameRoundRepository, GAME_ROUND_REPOSITORY } from "@instant-games/core-game-history";
import { WalletTransactionRepository, WALLET_TRANSACTION_REPOSITORY } from "@instant-games/core-ledger";
import { DemoWalletService, DbWalletService, WalletRouter, DEMO_WALLET, DB_WALLET, WALLET_ROUTER } from "@instant-games/core-wallet";
import { RedisIdempotencyStore, IDEMPOTENCY_STORE } from "@instant-games/core-idempotency";
import { RiskService, RISK_SERVICE } from "@instant-games/core-risk";
import { NoopBonusPort, BONUS_PORT } from "@instant-games/core-bonus";
import { WheelController } from "./wheel.controller";
import { MetricsController } from "./metrics.controller";
import { WheelService } from "./wheel.service";
import { GameBetRunner } from "@instant-games/core-game-slice";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule.forRoot(), RedisModule.forRoot(), AuthModule, LoggingModule, MetricsModule],
  controllers: [WheelController, MetricsController],
  providers: [
    GameBetRunner,
    WheelService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
    { provide: PROVABLY_FAIR_SERVICE, useClass: ProvablyFairService },
    {
      provide: PF_ROTATION_SERVICE,
      inject: [DB_CLIENT, PROVABLY_FAIR_SERVICE],
      useFactory: (db, pf) => new PfRotationService(db, pf),
    },
    {
      provide: PROVABLY_FAIR_STATE_STORE,
      inject: [KEY_VALUE_STORE, PF_ROTATION_SERVICE],
      useFactory: (kv, rotation) => new RedisProvablyFairStateStore(kv, rotation),
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
      provide: DB_WALLET,
      inject: [DB_CLIENT, LOCK_MANAGER],
      useFactory: (db, lock) => new DbWalletService(db, lock),
    },
    {
      provide: WALLET_ROUTER,
      inject: [ConfigService, DEMO_WALLET, DB_WALLET],
      useFactory: (config: ConfigService, demoWallet: DemoWalletService, dbWallet: DbWalletService) => {
        const walletImpl = (config.get<string>("WALLET_IMPL") ?? "demo").toLowerCase();
        const realEnabled = walletImpl === "db";
        return new WalletRouter(demoWallet, realEnabled ? dbWallet : undefined, {
          allowDemoFallback: !realEnabled,
        });
      },
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

