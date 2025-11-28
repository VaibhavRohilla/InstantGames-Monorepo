import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { AuthModule } from "@instant-games/core-auth";
import { LoggingModule, CorrelationIdInterceptor } from "@instant-games/core-logging";
import { MetricsModule } from "@instant-games/core-metrics";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { GamesController } from "./controllers/games.controller";
import { GameFrontendController } from "./controllers/game-frontend.controller";
import { GameApiController } from "./controllers/game-api.controller";
import { HealthController } from "./controllers/health.controller";
import { GameRegistryService } from "./services/game-registry.service";
import { GameProxyService } from "./services/game-proxy.service";
import { FrontendService } from "./services/frontend.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
    AuthModule,
    LoggingModule,
    MetricsModule,
  ],
  controllers: [GamesController, GameFrontendController, GameApiController, HealthController],
  providers: [
    GameRegistryService,
    GameProxyService,
    FrontendService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
  ],
})
export class AppModule {}

