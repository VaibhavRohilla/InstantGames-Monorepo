import { Injectable } from "@nestjs/common";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { GameRegistryService } from "./game-registry.service";

@Injectable()
export class FrontendService {
  private readonly gamesFrontendPath: string;
  private htmlTemplate: string | null = null;

  constructor(
    private readonly gameRegistry: GameRegistryService,
  ) {
    this.gamesFrontendPath = process.env.GAMES_FRONTEND_PATH || join(process.cwd(), "public", "games");
    this.loadTemplate();
  }

  private loadTemplate(): void {
    const templatePath = join(__dirname, "../../templates/game.html");
    if (existsSync(templatePath)) {
      this.htmlTemplate = readFileSync(templatePath, "utf-8");
    } else {
      // Fallback inline template
      this.htmlTemplate = this.getDefaultTemplate();
    }
  }

  private getDefaultTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{GAME_NAME}}</title>
  <link rel="stylesheet" href="/games/{{GAME_ID}}/assets/style.css">
  
  <script>
    // Injected game configuration
    window.GAME_CONFIG = {
      gameId: "{{GAME_ID}}",
      gameName: "{{GAME_NAME}}",
      apiBaseUrl: "{{API_BASE_URL}}",
      backendUrl: "{{BACKEND_URL}}",
      frontendUrl: "{{FRONTEND_URL}}"
    };
  </script>
</head>
<body>
  <div id="game-container">
    <div style="padding: 20px; text-align: center;">
      <h1>{{GAME_NAME}}</h1>
      <p>Loading game...</p>
    </div>
  </div>
  <script src="/games/{{GAME_ID}}/assets/game.js"></script>
</body>
</html>`;
  }

  getGameHtml(gameId: string): string {
    const game = this.gameRegistry.getGame(gameId);

    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }

    if (!this.htmlTemplate) {
      throw new Error("HTML template not loaded");
    }

    // Replace template variables
    let html = this.htmlTemplate;
    html = html.replace(/{{GAME_ID}}/g, game.id);
    html = html.replace(/{{GAME_NAME}}/g, game.name);
    html = html.replace(/{{API_BASE_URL}}/g, game.apiBaseUrl);
    html = html.replace(/{{BACKEND_URL}}/g, game.backendUrl);
    html = html.replace(/{{FRONTEND_URL}}/g, game.frontendUrl);

    return html;
  }

  getGameIndexPath(gameId: string): string {
    return join(this.gamesFrontendPath, gameId, "index.html");
  }

  gameFrontendExists(gameId: string): boolean {
    const indexPath = this.getGameIndexPath(gameId);
    return existsSync(indexPath);
  }

  getGamesFrontendPath(): string {
    return this.gamesFrontendPath;
  }
}

