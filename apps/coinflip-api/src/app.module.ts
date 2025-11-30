import { Module } from "@nestjs/common";
import { GameCoreModule } from "@instant-games/game-core";
import { CoinflipController } from "./coinflip.controller";
import { MetricsController } from "./metrics.controller";
import { CoinflipService } from "./coinflip.service";
import { HealthController } from "./health.controller";

@Module({
  imports: [GameCoreModule.register()],
  controllers: [CoinflipController, HealthController, MetricsController],
  providers: [CoinflipService],
})
export class AppModule {}
