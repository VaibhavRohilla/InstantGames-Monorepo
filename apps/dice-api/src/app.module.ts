import { Module } from "@nestjs/common";
import { GameCoreModule } from "@instant-games/game-core";
import { DiceController } from "./dice.controller";
import { HealthController } from "./health.controller";
import { MetricsController } from "./metrics.controller";
import { DiceService } from "./dice.service";

@Module({
  imports: [
    GameCoreModule.register(),
  ],
  controllers: [DiceController, HealthController, MetricsController],
  providers: [DiceService],
})
export class AppModule {}
