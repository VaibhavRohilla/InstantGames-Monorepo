import { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
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
export declare const LOGGER: unique symbol;
export declare class PinoLogger implements ILogger {
    private readonly logger;
    constructor();
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
}
export declare class CorrelationIdInterceptor implements NestInterceptor {
    private readonly logger;
    constructor(logger: ILogger);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
export declare class LoggingModule {
}
