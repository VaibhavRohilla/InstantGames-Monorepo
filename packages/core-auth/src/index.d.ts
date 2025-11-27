import { CanActivate, ExecutionContext } from "@nestjs/common";
import { GameMode } from "@instant-games/core-types";
export interface AuthContext {
    userId: string;
    operatorId: string;
    brandId?: string;
    isTestUser?: boolean;
    country?: string;
    currency: string;
    mode: GameMode;
    metadata?: Record<string, unknown>;
}
export interface IAuthPort {
    verifyToken(token: string): Promise<AuthContext>;
}
export interface IHeaderAwareAuthPort extends IAuthPort {
    verifyFromHeaders(headers: Record<string, string | string[] | undefined>): Promise<AuthContext>;
}
export declare const AUTH_PORT: unique symbol;
export declare const AUTH_CONTEXT_REQUEST_KEY = "authContext";
export declare class DummyAuthPort implements IHeaderAwareAuthPort {
    verifyToken(token: string): Promise<AuthContext>;
    verifyFromHeaders(headers: Record<string, string | string[] | undefined>): Promise<AuthContext>;
    private pickHeader;
    private tryParseToken;
    private tryJson;
    private normalizePayload;
}
export declare class AuthGuard implements CanActivate {
    private readonly authPort;
    constructor(authPort: IAuthPort);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractToken;
}
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
export declare class AuthModule {
}
