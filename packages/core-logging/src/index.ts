import { CallHandler, ExecutionContext, Global, Inject, Injectable, Module, NestInterceptor } from "@nestjs/common";
import pino, { Logger as PinoLoggerInstance } from "pino";
import { randomUUID } from "crypto";
import { Observable, tap } from "rxjs";

export interface ILogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface LogContext extends Record<string, unknown> {
  traceId?: string;
  userId?: string;
  operatorId?: string;
  game?: string;
  roundId?: string;
}

export const LOGGER = Symbol("LOGGER");

export class PinoLogger implements ILogger {
  private readonly logger: PinoLoggerInstance;

  constructor() {
    this.logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
  }

  info(msg: string, meta: Record<string, unknown> = {}): void {
    this.logger.info(meta, msg);
  }

  warn(msg: string, meta: Record<string, unknown> = {}): void {
    this.logger.warn(meta, msg);
  }

  error(msg: string, meta: Record<string, unknown> = {}): void {
    this.logger.error(meta, msg);
  }
}

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  constructor(@Inject(LOGGER) private readonly logger: ILogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ headers: Record<string, string | string[] | undefined>; traceId?: string }>();
    const response = http.getResponse<{ setHeader: (key: string, value: string) => void }>();

    const traceIdHeader = request.headers["x-trace-id"];
    const traceId = Array.isArray(traceIdHeader) ? traceIdHeader[0] : traceIdHeader ?? randomUUID();
    request.traceId = traceId;
    if (typeof response.setHeader === "function") {
      response.setHeader("x-trace-id", traceId);
    }

    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.logger.info("request.completed", { traceId, durationMs: Date.now() - start }),
        error: (err) => this.logger.error("request.error", { traceId, durationMs: Date.now() - start, err: err?.message }),
      })
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      useClass: PinoLogger,
    },
    CorrelationIdInterceptor,
  ],
  exports: [LOGGER, CorrelationIdInterceptor],
})
export class LoggingModule {}
