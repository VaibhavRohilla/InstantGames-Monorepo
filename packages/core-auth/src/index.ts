import { CanActivate, ExecutionContext, Global, Inject, Injectable, Module, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
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

export const AUTH_PORT = Symbol("AUTH_PORT");
export const AUTH_CONTEXT_REQUEST_KEY = "authContext";

export class DummyAuthPort implements IHeaderAwareAuthPort {
  async verifyToken(token: string): Promise<AuthContext> {
    if (!token) {
      throw new UnauthorizedException("Missing token");
    }

    const payload = this.tryParseToken(token);
    if (!payload) {
      throw new UnauthorizedException("Invalid dummy token");
    }
    return this.normalizePayload(payload);
  }

  async verifyFromHeaders(headers: Record<string, string | string[] | undefined>): Promise<AuthContext> {
    const userId = this.pickHeader(headers, "x-user-id") ?? "demo-user";
    const operatorId = this.pickHeader(headers, "x-operator-id") ?? "demo-op";
    const currency = this.pickHeader(headers, "x-currency") ?? "USD";
    const mode = (this.pickHeader(headers, "x-game-mode") ?? "demo") as GameMode;
    const brandId = this.pickHeader(headers, "x-brand-id");
    const country = this.pickHeader(headers, "x-country");
    const metadataHeader = this.pickHeader(headers, "x-user-metadata");

    return {
      userId,
      operatorId,
      brandId,
      country,
      currency,
      mode,
      metadata: metadataHeader ? this.tryJson(metadataHeader) : undefined,
    };
  }

  private pickHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const raw = headers[key];
    if (!raw) return undefined;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  private tryParseToken(token: string): Record<string, unknown> | null {
    try {
      const decoded = Buffer.from(token.replace(/^Bearer\s+/i, ""), "base64url").toString("utf-8");
      return JSON.parse(decoded);
    } catch (err) {
      return null;
    }
  }

  private tryJson(value: string): Record<string, unknown> | undefined {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  private normalizePayload(payload: Record<string, unknown>): AuthContext {
    const mode = (payload.mode ?? payload["gameMode"] ?? "demo") as GameMode;
    if (!payload.userId || !payload.operatorId || !payload.currency) {
      throw new UnauthorizedException("Incomplete dummy token payload");
    }

    return {
      userId: String(payload.userId),
      operatorId: String(payload.operatorId),
      brandId: payload.brandId ? String(payload.brandId) : undefined,
      isTestUser: Boolean(payload.isTestUser ?? false),
      country: payload.country ? String(payload.country) : undefined,
      currency: String(payload.currency),
      mode,
      metadata: typeof payload.metadata === "object" ? (payload.metadata as Record<string, unknown>) : undefined,
    };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_PORT) private readonly authPort: IAuthPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { [AUTH_CONTEXT_REQUEST_KEY]?: AuthContext }>();
    const token = this.extractToken(request);

    let authContext: AuthContext | null = null;
    if (token) {
      authContext = await this.authPort.verifyToken(token);
    } else if (isHeaderAware(this.authPort)) {
      authContext = await this.authPort.verifyFromHeaders(request.headers as Record<string, string | string[] | undefined>);
    }

    if (!authContext) {
      throw new UnauthorizedException("Unable to resolve auth context");
    }

    request[AUTH_CONTEXT_REQUEST_KEY] = authContext;
    return true;
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers["authorization"];
    if (!authHeader) return null;
    return Array.isArray(authHeader) ? authHeader[0] : authHeader;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const request = ctx.switchToHttp().getRequest<{ [AUTH_CONTEXT_REQUEST_KEY]: AuthContext }>();
  const user = request[AUTH_CONTEXT_REQUEST_KEY];
  if (!user) {
    throw new UnauthorizedException("Auth context missing in request");
  }
  return user;
});

function isHeaderAware(port: IAuthPort): port is IHeaderAwareAuthPort {
  return typeof (port as IHeaderAwareAuthPort).verifyFromHeaders === "function";
}

@Global()
@Module({
  providers: [
    {
      provide: AUTH_PORT,
      useClass: DummyAuthPort,
    },
    AuthGuard,
  ],
  exports: [AUTH_PORT, AuthGuard],
})
export class AuthModule {}
