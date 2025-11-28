import { Controller, Get, Param, NotFoundException, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@instant-games/core-auth";
import { GameRegistryService } from "../services/game-registry.service";

@Controller("api/v1/games")
@UseGuards(AuthGuard)
export class GamesController {
  constructor(private readonly gameRegistry: GameRegistryService) {}

  @Get()
  listGames() {
    const games = this.gameRegistry.getAllGames();
    return {
      games: games.map((game) => ({
        id: game.id,
        name: game.name,
        enabled: game.enabled,
        frontendUrl: game.frontendUrl,
        externalFrontendUrl: game.externalFrontendUrl, // Include external URL if set
        apiBaseUrl: game.apiBaseUrl,
      })),
    };
  }

  @Get(":gameId")
  getGame(@Param("gameId") gameId: string) {
    const game = this.gameRegistry.getGame(gameId);
    if (!game) {
      throw new NotFoundException(`Game ${gameId} not found`);
    }

    return {
      id: game.id,
      name: game.name,
      enabled: game.enabled,
      frontendUrl: game.frontendUrl,
      externalFrontendUrl: game.externalFrontendUrl,
      apiBaseUrl: game.apiBaseUrl,
      backendUrl: game.backendUrl,
    };
  }
}

