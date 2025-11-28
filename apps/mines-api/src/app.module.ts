import { Module } from "@nestjs/common";
import { GameCoreModule } from "@instant-games/game-core";
import { MetricsController } from "./metrics.controller";
import { MinesController } from "./mines.controller";
import { MinesService } from "./mines.service";

@Module({
  imports: [GameCoreModule.register()],
  controllers: [MinesController, MetricsController],
  providers: [MinesService],
})
export class AppModule {}

