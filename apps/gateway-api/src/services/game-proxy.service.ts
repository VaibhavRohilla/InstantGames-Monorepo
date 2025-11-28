import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { GameRegistryService } from "./game-registry.service";

@Injectable()
export class GameProxyService {
  constructor(
    private readonly httpService: HttpService,
    private readonly gameRegistry: GameRegistryService,
  ) {}

  async proxyRequest(
    gameId: string,
    path: string,
    method: string,
    body?: any,
    headers?: Record<string, string>,
  ): Promise<any> {
    const game = this.gameRegistry.getGame(gameId);

    if (!game || !game.enabled) {
      throw new HttpException(`Game ${gameId} not found or disabled`, HttpStatus.NOT_FOUND);
    }

    const url = `${game.backendUrl}/${gameId}${path}`;

    // Prepare headers - preserve important headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    // Remove host and connection headers that shouldn't be forwarded
    delete requestHeaders["host"];
    delete requestHeaders["connection"];
    delete requestHeaders["content-length"];

    const config: AxiosRequestConfig = {
      method: method as any,
      url,
      headers: requestHeaders,
      data: body,
      timeout: 30000, // 30 second timeout
      validateStatus: () => true, // Don't throw on any status
    };

    try {
      const response: AxiosResponse = await firstValueFrom(this.httpService.request(config));

      // Forward the response
      return {
        data: response.data,
        status: response.status,
        headers: response.headers,
      };
    } catch (error: any) {
      if (error.response) {
        // Backend service responded with error
        throw new HttpException(
          {
            statusCode: error.response.status,
            message: error.response.data?.message || error.message,
            error: error.response.data?.error || "Backend service error",
          },
          error.response.status,
        );
      } else if (error.request) {
        // Request made but no response
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_GATEWAY,
            message: `Failed to connect to ${gameId} backend service`,
            error: "Backend service unavailable",
          },
          HttpStatus.BAD_GATEWAY,
        );
      } else {
        // Error setting up request
        throw new HttpException(
          {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: error.message,
            error: "Proxy error",
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async checkGameHealth(gameId: string): Promise<boolean> {
    try {
      const response = await this.proxyRequest(gameId, "/health", "GET");
      return response.status === 200 && response.data?.status === "ok";
    } catch {
      return false;
    }
  }
}

