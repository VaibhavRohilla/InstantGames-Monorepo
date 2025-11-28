import { Controller, Post, Get, Param, Body, Req, Headers, HttpCode, HttpStatus, NotFoundException } from "@nestjs/common";
import { Request } from "express";
import { GameProxyService } from "../services/game-proxy.service";
import { GameRegistryService } from "../services/game-registry.service";

@Controller("api/v1/games")
export class GameApiController {
  constructor(
    private readonly proxyService: GameProxyService,
    private readonly gameRegistry: GameRegistryService,
  ) {}

  @Get(":gameId/health")
  async getGameHealth(@Param("gameId") gameId: string) {
    const isHealthy = await this.proxyService.checkGameHealth(gameId);
    return {
      game: gameId,
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
    };
  }

  @Post(":gameId/bet")
  @HttpCode(HttpStatus.OK)
  async proxyBet(
    @Param("gameId") gameId: string,
    @Body() body: any,
    @Req() req: Request,
    @Headers() headers: Record<string, string>,
  ) {
    if (!this.gameRegistry.isGameEnabled(gameId)) {
      throw new NotFoundException(`Game ${gameId} not found or disabled`);
    }

    // Extract headers to forward
    const forwardHeaders: Record<string, string> = {};
    const headerKeys = ["x-user-id", "x-operator-id", "x-idempotency-key", "x-correlation-id", "authorization"];

    for (const key of headerKeys) {
      const value = headers[key] || headers[key.toLowerCase()];
      if (value) {
        forwardHeaders[key] = value;
      }
    }

    // Forward the request to the game backend
    const response = await this.proxyService.proxyRequest(gameId, "/bet", "POST", body, forwardHeaders);

    // Return the response from the backend
    return response.data;
  }

  @Get(":gameId/metrics")
  async getGameMetrics(@Param("gameId") gameId: string) {
    const response = await this.proxyService.proxyRequest(gameId, "/metrics", "GET");
    return response.data;
  }
}

