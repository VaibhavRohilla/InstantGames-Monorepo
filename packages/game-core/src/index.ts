import { DynamicModule, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "@instant-games/core-auth";
import { DbModule, DB_CLIENT, DbModuleOptions, IDbClient } from "@instant-games/core-db";
import { RedisModule, KEY_VALUE_STORE, LOCK_MANAGER, RedisModuleOptions } from "@instant-games/core-redis";
import { LoggingModule, CorrelationIdInterceptor, LOGGER } from "@instant-games/core-logging";
import { MetricsModule, METRICS } from "@instant-games/core-metrics";
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
import { GameBetRunner } from "@instant-games/core-game-slice";

export interface GameCoreModuleOptions {
  db?: DbModuleOptions;
  redis?: RedisModuleOptions;
  wallet?: {
    allowDemoFallback?: boolean;
  };
}

@Module({})
export class GameCoreModule {
  static register(options: GameCoreModuleOptions = {}): DynamicModule {
    const walletOptions = options.wallet ?? {};

    return {
      module: GameCoreModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DbModule.forRoot(options.db),
        RedisModule.forRoot(options.redis),
        AuthModule,
        LoggingModule,
        MetricsModule,
      ],
      providers: [
        GameBetRunner,
        { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
        { provide: PROVABLY_FAIR_SERVICE, useClass: ProvablyFairService },
        {
          provide: PF_ROTATION_SERVICE,
          inject: [DB_CLIENT, PROVABLY_FAIR_SERVICE],
          useFactory: (db: IDbClient, pf: ProvablyFairService) => new PfRotationService(db, pf),
        },
        {
          provide: PROVABLY_FAIR_STATE_STORE,
          inject: [KEY_VALUE_STORE, PF_ROTATION_SERVICE],
          useFactory: (kv, rotation) => new RedisProvablyFairStateStore(kv, rotation),
        },
        {
          provide: RNG_SERVICE,
          inject: [PROVABLY_FAIR_SERVICE],
          useFactory: (pf: ProvablyFairService) => new ProvablyFairRngService(pf),
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
            const allowDemoFallback = walletOptions.allowDemoFallback ?? !realEnabled;
            return new WalletRouter(demoWallet, realEnabled ? dbWallet : undefined, {
              allowDemoFallback,
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
      exports: [
        GameBetRunner,
        PROVABLY_FAIR_SERVICE,
        PROVABLY_FAIR_STATE_STORE,
        PF_ROTATION_SERVICE,
        RNG_SERVICE,
        GAME_CONFIG_SERVICE,
        GAME_ROUND_REPOSITORY,
        WALLET_TRANSACTION_REPOSITORY,
        DEMO_WALLET,
        DB_WALLET,
        WALLET_ROUTER,
        IDEMPOTENCY_STORE,
        RISK_SERVICE,
        BONUS_PORT,
        LOGGER,
        METRICS,
        DB_CLIENT,
        KEY_VALUE_STORE,
        LOCK_MANAGER,
      ],
    };
  }
}

