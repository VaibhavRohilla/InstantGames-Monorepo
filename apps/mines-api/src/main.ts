import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new Logger());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  const port = process.env.MINES_API_PORT ? Number(process.env.MINES_API_PORT) : process.env.PORT ? Number(process.env.PORT) : 3004;
  await app.listen(port);
  Logger.log(`Mines API is running on port ${port}`);
}

void bootstrap();

