import { Module } from "@nestjs/common";
import { GameCoreModule } from "@instant-games/game-core";
import { HiloController } from "./hilo.controller";
import { MetricsController } from "./metrics.controller";
import { HiloService } from "./hilo.service";
import { HealthController } from "./health.controller";
import { HiloConfigService } from "./hilo.config";

@Module({
  imports: [GameCoreModule.register()],
  controllers: [HiloController, HealthController, MetricsController],
  providers: [HiloService, HiloConfigService],
})
export class AppModule {}

