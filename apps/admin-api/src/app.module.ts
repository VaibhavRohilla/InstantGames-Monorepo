import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DbModule, DB_CLIENT } from "@instant-games/core-db";
import { LoggingModule } from "@instant-games/core-logging";
import { MetricsModule } from "@instant-games/core-metrics";
import { ProvablyFairService, PROVABLY_FAIR_SERVICE, PfRotationService, PF_ROTATION_SERVICE } from "@instant-games/core-provably-fair";
import { AdminAuthGuard } from "./auth/admin-auth.guard";
import { RoundsController } from "./controllers/rounds.controller";
import { WalletsController } from "./controllers/wallets.controller";
import { LedgerController } from "./controllers/ledger.controller";
import { PfController } from "./controllers/pf.controller";
import { MetricsController } from "./controllers/metrics.controller";
import { RoundsService } from "./services/rounds.service";
import { WalletsService } from "./services/wallets.service";
import { LedgerService } from "./services/ledger.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule.forRoot(), LoggingModule, MetricsModule],
  controllers: [RoundsController, WalletsController, LedgerController, PfController, MetricsController],
  providers: [
    AdminAuthGuard,
    RoundsService,
    WalletsService,
    LedgerService,
    { provide: PROVABLY_FAIR_SERVICE, useClass: ProvablyFairService },
    {
      provide: PF_ROTATION_SERVICE,
      inject: [DB_CLIENT, PROVABLY_FAIR_SERVICE],
      useFactory: (db, pf) => new PfRotationService(db, pf),
    },
  ],
})
export class AppModule {}

