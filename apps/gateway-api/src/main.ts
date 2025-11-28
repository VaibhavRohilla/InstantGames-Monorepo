import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { AppModule } from "./app.module";

export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(new Logger());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  // Enable CORS for frontend access
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id", "x-operator-id", "x-idempotency-key", "x-correlation-id"],
  });

  // Serve static files for game frontends
  const gamesFrontendPath = process.env.GAMES_FRONTEND_PATH || join(__dirname, "../../../public/games");
  app.useStaticAssets(gamesFrontendPath, {
    prefix: "/games/",
  });

  const port = process.env.GATEWAY_PORT ? Number(process.env.GATEWAY_PORT) : process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  Logger.log(`Gateway API is running on port ${port}`);
  Logger.log(`Games frontend path: ${gamesFrontendPath}`);
}

void bootstrap();

