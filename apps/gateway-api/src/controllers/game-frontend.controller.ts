import { Controller, Get, Param, Res, NotFoundException, Req } from "@nestjs/common";
import { Request, Response } from "express";
import { readFileSync, existsSync } from "fs";
import { FrontendService } from "../services/frontend.service";
import { GameInfo, GameRegistryService } from "../services/game-registry.service";

const frontendCache = new Map<string, string>();
const shouldCacheFrontends = (process.env.NODE_ENV ?? "development") === "production";

@Controller("games")
export class GameFrontendController {
  constructor(
    private readonly frontendService: FrontendService,
    private readonly gameRegistry: GameRegistryService,
  ) {}

  @Get()
  gameLobby(@Res() res: Response) {
    const games = this.gameRegistry.getAllGames();
    const html = this.generateLobbyHtml(games);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }

  @Get(":gameId")
  serveGame(@Param("gameId") gameId: string, @Req() req: Request, @Res() res: Response) {
    const game = this.gameRegistry.getGame(gameId);
    const sessionToken = this.extractSessionToken(req);

    if (!game || !game.enabled) {
      throw new NotFoundException(`Game ${gameId} not found`);
    }

    // If external frontend URL is configured, serve wrapper that loads external frontend
    if (game.externalFrontendUrl) {
      const wrapperHtml = this.createExternalFrontendWrapper(game, sessionToken);
      res.setHeader("Content-Type", "text/html");
      return res.send(wrapperHtml);
    }

    // Try to serve custom index.html first (local files)
    const customIndexPath = this.frontendService.getGameIndexPath(gameId);
    const customHtml = this.getCachedFrontend(customIndexPath);
    if (customHtml) {
      const html = customHtml.replace(
        /<script>\s*window\.GAME_CONFIG\s*=\s*\{[^}]*\};?\s*<\/script>/,
        `<script>window.GAME_CONFIG = ${JSON.stringify({
          gameId: game.id,
          gameName: game.name,
          apiBaseUrl: game.apiBaseUrl,
          backendUrl: game.backendUrl,
          frontendUrl: game.frontendUrl,
          jwtToken: sessionToken ?? "",
        })};</script>`,
      );
      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    }

    // Fallback to template (local hosting)
    const html = this.frontendService.getGameHtml(gameId, sessionToken);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }

  private extractSessionToken(req: Request): string | undefined {
    const sessionParam = req.query.session;
    if (typeof sessionParam === "string" && sessionParam.trim().length > 0) {
      return sessionParam.trim();
    }
    return undefined;
  }

  private createExternalFrontendWrapper(game: GameInfo, sessionToken?: string): string {
    const iframeSrc = this.buildIframeSrc(game.externalFrontendUrl ?? "", sessionToken);

    const config = {
      gameId: game.id,
      gameName: game.name,
      apiBaseUrl: game.apiBaseUrl,
      backendUrl: game.backendUrl,
      frontendUrl: game.frontendUrl,
      jwtToken: sessionToken ?? "",
    };

    // Option 1: Redirect to external URL with config in query params
    // Option 2: Serve wrapper that loads external frontend and injects config
    // We'll use Option 2 for better control

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${game.name}</title>
  <script>
    // Inject game configuration BEFORE external frontend loads
    window.GAME_CONFIG = ${JSON.stringify(config, null, 2)};
    
    console.log('Game Config injected:', window.GAME_CONFIG);
    
    // Make config available to external frontend
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'GET_GAME_CONFIG') {
        event.source.postMessage({
          type: 'GAME_CONFIG',
          config: window.GAME_CONFIG
        }, event.origin);
      }
    });
  </script>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    iframe {
      width: 100%;
      height: 100vh;
      border: none;
    }
    #loading {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div id="loading">
    <div style="text-align: center;">
      <h2>Loading ${game.name}...</h2>
      <p>If this takes too long, the frontend may not be available at the configured URL.</p>
    </div>
  </div>
  <iframe 
    id="game-iframe" 
    src="${iframeSrc}" 
    onload="document.getElementById('loading').style.display='none'"
    allow="fullscreen"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  ></iframe>
  
  <script>
    // Alternative: Redirect to external URL with config in hash
    // Uncomment if you prefer redirect approach
    /*
    const configStr = encodeURIComponent(JSON.stringify(${JSON.stringify(config)}));
    window.location.href = '${game.externalFrontendUrl}#config=' + configStr;
    */
    
    // Provide helper function for external frontend to get config
    window.getGameConfig = function() {
      return window.GAME_CONFIG;
    };
  </script>
</body>
</html>`;
  }

  private buildIframeSrc(url: string, sessionToken?: string): string {
    if (!sessionToken) {
      return url;
    }

    try {
      const parsed = new URL(url);
      parsed.searchParams.set("session", sessionToken);
      return parsed.toString();
    } catch {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}session=${encodeURIComponent(sessionToken)}`;
    }
  }

  private getCachedFrontend(path: string): string | null {
    if (shouldCacheFrontends) {
      const cached = frontendCache.get(path);
      if (cached) {
        return cached;
      }
    }

    if (!existsSync(path)) {
      return null;
    }

    try {
      const html = readFileSync(path, "utf-8");
      if (shouldCacheFrontends) {
        frontendCache.set(path, html);
      }
      return html;
    } catch (error) {
      if (shouldCacheFrontends) {
        frontendCache.delete(path);
      }
      return null;
    }
  }

  private generateLobbyHtml(games: GameInfo[]): string {
    const gameCards = games
      .map(
        (game) => `
    <div class="game-card" onclick="window.location.href='${game.frontendUrl}'">
      <h3>${game.name}</h3>
      <p>Click to play</p>
    </div>
  `,
      )
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Instant Games - Game Lobby</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 40px;
    }
    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px;
    }
    .game-card {
      background: white;
      border-radius: 12px;
      padding: 30px;
      text-align: center;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .game-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
    }
    .game-card h3 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .game-card p {
      margin: 0;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎮 Instant Games Lobby</h1>
    <div class="games-grid">
      ${gameCards}
    </div>
  </div>
</body>
</html>`;
  }
}

