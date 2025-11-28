import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface GameInfo {
  id: string;
  name: string;
  enabled: boolean;
  backendUrl: string;
  frontendPath: string;
  frontendUrl: string; // Gateway route: /games/:gameId
  externalFrontendUrl?: string; // External hosted URL (CDN, separate server, etc.)
  port: number;
  apiBaseUrl: string;
}

@Injectable()
export class GameRegistryService {
  private readonly games: Map<string, GameInfo>;

  constructor(private readonly config: ConfigService) {
    this.games = this.buildGameRegistry();
  }

  private buildGameRegistry(): Map<string, GameInfo> {
    const baseUrl = this.config.get<string>("GATEWAY_BASE_URL") || "http://localhost:3000";
    const backendHost = this.config.get<string>("GAME_BACKEND_HOST") || "http://localhost";

    const registry = new Map<string, GameInfo>();

    const gameConfigs = [
      {
        id: "dice",
        name: "Dice",
        port: 3001,
        envUrl: "DICE_API_URL",
      },
      {
        id: "coinflip",
        name: "CoinFlip",
        port: 3009,
        envUrl: "COINFLIP_API_URL",
      },
      {
        id: "roulette",
        name: "Roulette",
        port: 3003,
        envUrl: "ROULETTE_API_URL",
      },
      {
        id: "mines",
        name: "Mines",
        port: 3004,
        envUrl: "MINES_API_URL",
      },
      {
        id: "hilo",
        name: "Hi-Lo",
        port: 3006,
        envUrl: "HILO_API_URL",
      },
      {
        id: "plinko",
        name: "Plinko",
        port: 3005,
        envUrl: "PLINKO_API_URL",
      },
      {
        id: "wheel",
        name: "Wheel",
        port: 3008,
        envUrl: "WHEEL_API_URL",
      },
      {
        id: "keno",
        name: "Keno",
        port: 3007,
        envUrl: "KENO_API_URL",
      },
    ];

    for (const config of gameConfigs) {
      const backendUrl = this.config.get<string>(config.envUrl) || `${backendHost}:${config.port}`;
      const frontendPath = this.config.get<string>(`${config.id.toUpperCase()}_FRONTEND_PATH`) || `./public/games/${config.id}`;
      const externalFrontendUrl = this.config.get<string>(`${config.id.toUpperCase()}_FRONTEND_URL`);

      registry.set(config.id, {
        id: config.id,
        name: config.name,
        enabled: this.config.get<boolean>(`${config.id.toUpperCase()}_ENABLED`) ?? true,
        backendUrl,
        frontendPath,
        externalFrontendUrl,
        port: config.port,
        apiBaseUrl: `${baseUrl}/api/v1/games/${config.id}`,
        frontendUrl: `${baseUrl}/games/${config.id}`,
      });
    }

    return registry;
  }

  getGame(gameId: string): GameInfo | null {
    return this.games.get(gameId) || null;
  }

  getAllGames(): GameInfo[] {
    return Array.from(this.games.values()).filter((game) => game.enabled);
  }

  isGameEnabled(gameId: string): boolean {
    const game = this.games.get(gameId);
    return game?.enabled ?? false;
  }
}

