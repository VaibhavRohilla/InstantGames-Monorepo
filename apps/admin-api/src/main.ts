import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new Logger());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  const port = process.env.ADMIN_API_PORT ? Number(process.env.ADMIN_API_PORT) : 3002;
  await app.listen(port);
  Logger.log(`Admin API listening on port ${port}`);
}

void bootstrap();

