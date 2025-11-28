import { Controller, Get, Param, Res, NotFoundException } from "@nestjs/common";
import { Response } from "express";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { FrontendService } from "../services/frontend.service";
import { GameRegistryService } from "../services/game-registry.service";

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
  serveGame(@Param("gameId") gameId: string, @Res() res: Response) {
    const game = this.gameRegistry.getGame(gameId);

    if (!game || !game.enabled) {
      throw new NotFoundException(`Game ${gameId} not found`);
    }

    // If external frontend URL is configured, serve wrapper that loads external frontend
    if (game.externalFrontendUrl) {
      const wrapperHtml = this.createExternalFrontendWrapper(game);
      res.setHeader("Content-Type", "text/html");
      return res.send(wrapperHtml);
    }

    // Try to serve custom index.html first (local files)
    const customIndexPath = this.frontendService.getGameIndexPath(gameId);
    if (existsSync(customIndexPath)) {
      try {
        const customHtml = readFileSync(customIndexPath, "utf-8");
        // Inject config into custom HTML if it has placeholder
        const html = customHtml.replace(
          /<script>\s*window\.GAME_CONFIG\s*=\s*\{[^}]*\};?\s*<\/script>/,
          `<script>window.GAME_CONFIG = ${JSON.stringify({
            gameId: game.id,
            gameName: game.name,
            apiBaseUrl: game.apiBaseUrl,
            backendUrl: game.backendUrl,
            frontendUrl: game.frontendUrl,
          })};</script>`,
        );
        res.setHeader("Content-Type", "text/html");
        return res.send(html);
      } catch (error) {
        // Fall through to template
      }
    }

    // Fallback to template (local hosting)
    const html = this.frontendService.getGameHtml(gameId);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  }

  private createExternalFrontendWrapper(game: any): string {
    const config = {
      gameId: game.id,
      gameName: game.name,
      apiBaseUrl: game.apiBaseUrl,
      backendUrl: game.backendUrl,
      frontendUrl: game.frontendUrl,
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
    src="${game.externalFrontendUrl}" 
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

  private generateLobbyHtml(games: any[]): string {
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

