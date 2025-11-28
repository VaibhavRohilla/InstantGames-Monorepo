import { Controller, Get } from "@nestjs/common";
import { GameRegistryService } from "../services/game-registry.service";
import { GameProxyService } from "../services/game-proxy.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly gameRegistry: GameRegistryService,
    private readonly proxyService: GameProxyService,
  ) {}

  @Get()
  async health() {
    const games = this.gameRegistry.getAllGames();
    const gameHealth: Record<string, boolean> = {};

    // Check health of all enabled games (async, don't wait)
    const healthChecks = games.map(async (game) => {
      try {
        const isHealthy = await this.proxyService.checkGameHealth(game.id);
        gameHealth[game.id] = isHealthy;
      } catch {
        gameHealth[game.id] = false;
      }
    });

    await Promise.allSettled(healthChecks);

    const allHealthy = Object.values(gameHealth).every((h) => h);

    return {
      status: allHealthy ? "ok" : "degraded",
      gateway: "ok",
      games: gameHealth,
      timestamp: new Date().toISOString(),
    };
  }
}

