/**
 * Core Auth Package - JWT-Only Authentication System
 *
 * This package provides a JWT-based authentication system for both demo and real-money modes.
 * All authentication is done via JWT tokens in the Authorization header.
 *
 * @module @instant-games/core-auth
 */

import {
  CanActivate,
  ExecutionContext,
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import { GameMode } from "@instant-games/core-types";
import { RgsErrorCode, rgsErrorPayload } from "@instant-games/core-errors";
import * as jwt from "jsonwebtoken";

/**
 * Authentication context containing user and operator information
 * This is the single source of truth for user identity across all services.
 */
export interface AuthContext {
  userId: string;
  operatorId: string;
  currency: string;
  mode: GameMode;

  brandId?: string;
  country?: string;
  isTestUser?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Port interface for authentication token verification
 */
export interface IAuthPort {
  verifyToken(token: string): Promise<AuthContext>;
}

/**
 * JWT claims interface expected in tokens
 */
export interface AuthJwtPayload extends jwt.JwtPayload {
  sub: string; // userId
  operatorId: string;
  currency: string;
  mode: GameMode | string; // "demo" | "real"
  brandId?: string;
  country?: string;
  isTestUser?: boolean;
  [key: string]: unknown; // Additional fields go into metadata
}

/**
 * Configuration options for JwtAuthPort
 */
export interface JwtAuthPortOptions {
  algorithm: "HS256" | "RS256";
  secret?: string; // For HS256
  publicKey?: string; // For RS256
  issuer?: string;
  audience?: string;
}

export const AUTH_PORT = Symbol("AUTH_PORT");
export const AUTH_CONTEXT_REQUEST_KEY = "authContext";

/**
 * JWT-based authentication port
 *
 * This is the ONLY authentication mechanism in the system.
 * Used for both demo and real-money modes, distinguished by the `mode` claim in the JWT.
 *
 * Environment variables:
 * - AUTH_JWT_ALGO: "HS256" | "RS256" (default: "HS256")
 * - AUTH_JWT_SECRET: Secret key for HS256 (required if using HS256)
 * - AUTH_JWT_PUBLIC_KEY: Public key for RS256 (required if using RS256)
 * - AUTH_JWT_ISSUER: Optional issuer to validate (recommended)
 * - AUTH_JWT_AUDIENCE: Optional audience to validate (recommended)
 *
 * JWT Claims Mapping:
 * - `sub` → userId (required)
 * - `operatorId` → operatorId (required)
 * - `currency` → currency (required)
 * - `mode` → mode "demo" | "real" (required)
 * - `brandId` → brandId (optional)
 * - `country` → country (optional)
 * - `isTestUser` → isTestUser (optional)
 * - All other claims → metadata (optional)
 *
 * Validates:
 * - Token signature
 * - Expiration (`exp` claim)
 * - Not before (`nbf` claim, if present)
 * - Issuer (`iss` claim, if AUTH_JWT_ISSUER is set)
 * - Audience (`aud` claim, if AUTH_JWT_AUDIENCE is set)
 *
 * Throws UnauthorizedException on any validation failure.
 */
export class JwtAuthPort implements IAuthPort {
  private readonly logger = new Logger(JwtAuthPort.name);
  private readonly algorithm: "HS256" | "RS256";
  private readonly secretOrPublicKey: string;
  private readonly issuer?: string;
  private readonly audience?: string;

  constructor(options?: JwtAuthPortOptions) {
    if (options) {
      // Direct options provided (useful for testing)
      this.algorithm = options.algorithm;
      if (this.algorithm === "HS256") {
        if (!options.secret) {
          throw new Error("Secret is required for HS256 algorithm");
        }
        this.secretOrPublicKey = options.secret;
      } else {
        if (!options.publicKey) {
          throw new Error("Public key is required for RS256 algorithm");
        }
        this.secretOrPublicKey = options.publicKey.includes("-----BEGIN") ? options.publicKey : Buffer.from(options.publicKey, "base64").toString("utf-8");
      }
      this.issuer = options.issuer;
      this.audience = options.audience;
    } else {
      // Read from environment variables
      const algo = (process.env.AUTH_JWT_ALGO ?? "HS256").toUpperCase();
      if (algo !== "HS256" && algo !== "RS256") {
        throw new Error(`Unsupported JWT algorithm: ${algo}. Supported: HS256, RS256`);
      }
      this.algorithm = algo;

      if (this.algorithm === "HS256") {
        const secret = process.env.AUTH_JWT_SECRET;
        if (!secret) {
          throw new Error("AUTH_JWT_SECRET is required for HS256 algorithm. Set it in your environment variables.");
        }
        this.secretOrPublicKey = secret;
      } else {
        // RS256
        const publicKey = process.env.AUTH_JWT_PUBLIC_KEY;
        if (!publicKey) {
          throw new Error("AUTH_JWT_PUBLIC_KEY is required for RS256 algorithm. Set it in your environment variables.");
        }
        // Support both base64-encoded keys and PEM format
        this.secretOrPublicKey = publicKey.includes("-----BEGIN") ? publicKey : Buffer.from(publicKey, "base64").toString("utf-8");
      }

      this.issuer = process.env.AUTH_JWT_ISSUER;
      this.audience = process.env.AUTH_JWT_AUDIENCE;
    }

    this.logger.log(`JWT Auth initialized with algorithm: ${this.algorithm}`);
  }

  async verifyToken(token: string): Promise<AuthContext> {
    if (!token) {
      throw new UnauthorizedException(rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "Missing authorization token"));
    }

    // Remove "Bearer " prefix if present
    const cleanToken = token.replace(/^Bearer\s+/i, "");

    try {
      const verifyOptions: jwt.VerifyOptions = {
        algorithms: [this.algorithm],
      };

      if (this.issuer) {
        verifyOptions.issuer = this.issuer;
      }

      if (this.audience) {
        verifyOptions.audience = this.audience;
      }

      const decoded = jwt.verify(cleanToken, this.secretOrPublicKey, verifyOptions) as AuthJwtPayload;

      // Validate required claims
      const userId = decoded.sub;
      const operatorId = decoded.operatorId;
      const currency = decoded.currency;
      const mode = decoded.mode;

      if (!userId) {
        throw new UnauthorizedException(
          rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "JWT missing required claim: sub (userId)"),
        );
      }
      if (!operatorId) {
        throw new UnauthorizedException(rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "JWT missing required claim: operatorId"));
      }
      if (!currency) {
        throw new UnauthorizedException(rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "JWT missing required claim: currency"));
      }
      if (!mode || (mode !== "demo" && mode !== "real")) {
        throw new UnauthorizedException(
          rgsErrorPayload(RgsErrorCode.AUTH_FAILED, 'JWT missing or invalid required claim: mode (must be "demo" or "real")'),
        );
      }

      // Extract metadata from remaining claims (exclude standard JWT claims and known fields)
      const standardClaims = ["sub", "iat", "exp", "nbf", "iss", "aud", "jti"];
      const knownFields = ["operatorId", "currency", "mode", "brandId", "country", "isTestUser"];
      const metadata: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(decoded)) {
        if (!standardClaims.includes(key) && !knownFields.includes(key)) {
          metadata[key] = value;
        }
      }

      return {
        userId: String(userId),
        operatorId: String(operatorId),
        brandId: decoded.brandId ? String(decoded.brandId) : undefined,
        isTestUser: decoded.isTestUser !== undefined ? Boolean(decoded.isTestUser) : undefined,
        country: decoded.country ? String(decoded.country) : undefined,
        currency: String(currency),
        mode: mode as GameMode,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException(rgsErrorPayload(RgsErrorCode.TOKEN_EXPIRED, "Token has expired"));
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException(rgsErrorPayload(RgsErrorCode.AUTH_FAILED, `Invalid token: ${error.message}`));
      }
      if (error instanceof jwt.NotBeforeError) {
        throw new UnauthorizedException(rgsErrorPayload(RgsErrorCode.AUTH_FAILED, `Token not yet valid: ${error.message}`));
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error("JWT verification error", error);
      throw new UnauthorizedException(rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "Token verification failed"));
    }
  }
}

/**
 * Authentication guard that validates requests and attaches AuthContext
 *
 * Behavior:
 * 1. Checks if route is public (health/metrics endpoints) - bypasses auth
 * 2. Extracts JWT from Authorization: Bearer <token> header
 * 3. Verifies token via authPort.verifyToken()
 * 4. Attaches AuthContext to request[AUTH_CONTEXT_REQUEST_KEY]
 * 5. Throws UnauthorizedException if token is missing or invalid
 *
 * Public routes (bypassed):
 * - GET /health
 * - GET /metrics
 * - GET /api/v1/games/:gameId/health
 *
 * Usage:
 * ```typescript
 * @Controller('api')
 * @UseGuards(AuthGuard)
 * export class MyController {
 *   @Get('protected')
 *   protectedRoute(@Auth() ctx: AuthContext) {
 *     // ctx contains authenticated user info
 *   }
 * }
 * ```
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private static readonly PUBLIC_ROUTES = [
    { method: "GET", path: /^\/health$/ },
    { method: "GET", path: /^\/metrics$/ },
    { method: "GET", path: /^\/api\/v1\/games\/[^/]+\/health$/ },
  ];

  constructor(@Inject(AUTH_PORT) private readonly authPort: IAuthPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { [AUTH_CONTEXT_REQUEST_KEY]?: AuthContext }>();

    // Check if route is public
    if (this.isPublicRoute(request)) {
      return true;
    }

    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(
        rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "Missing authorization token. Provide Authorization: Bearer <token> header."),
      );
    }

    try {
      const authContext = await this.authPort.verifyToken(token);
      request[AUTH_CONTEXT_REQUEST_KEY] = authContext;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error("Authentication error", error);
      throw new UnauthorizedException(rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "Invalid or missing authentication token"));
    }
  }

  private isPublicRoute(request: Request): boolean {
    const method = request.method;
    const path = request.path;

    return AuthGuard.PUBLIC_ROUTES.some((route) => {
      if (route.method !== method) return false;
      if (typeof route.path === "string") {
        return path === route.path || path.startsWith(route.path);
      }
      if (route.path instanceof RegExp) {
        return route.path.test(path);
      }
      return false;
    });
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers["authorization"];
    if (!authHeader) return null;
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    return headerValue || null;
  }
}

/**
 * Parameter decorator to extract AuthContext from request
 *
 * Usage:
 * ```typescript
 * @Post('bet')
 * async placeBet(@Auth() ctx: AuthContext) {
 *   // Use ctx.userId, ctx.operatorId, ctx.mode, ctx.currency, etc.
 * }
 * ```
 */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const request = ctx.switchToHttp().getRequest<Request & { [AUTH_CONTEXT_REQUEST_KEY]: AuthContext }>();
  const authContext = request[AUTH_CONTEXT_REQUEST_KEY];
  if (!authContext) {
    throw new UnauthorizedException(
      rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "Auth context missing in request. Ensure AuthGuard is applied to this route."),
    );
  }
  return authContext;
});

/**
 * Parameter decorator to extract AuthContext from request (alias for @Auth())
 *
 * @deprecated Use @Auth() instead for consistency
 * This is kept for backward compatibility with existing code
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const request = ctx.switchToHttp().getRequest<Request & { [AUTH_CONTEXT_REQUEST_KEY]: AuthContext }>();
  const authContext = request[AUTH_CONTEXT_REQUEST_KEY];
  if (!authContext) {
    throw new UnauthorizedException(
      rgsErrorPayload(RgsErrorCode.AUTH_FAILED, "Auth context missing in request. Ensure AuthGuard is applied to this route."),
    );
  }
  return authContext;
});

/**
 * Global authentication module
 *
 * Provides JWT-based authentication to all modules in the application.
 * Uses JwtAuthPort as the single authentication mechanism for both demo and real-money modes.
 *
 * Environment variables:
 * - AUTH_JWT_ALGO: "HS256" | "RS256" (default: "HS256")
 * - AUTH_JWT_SECRET: Secret key for HS256 (required if using HS256)
 * - AUTH_JWT_PUBLIC_KEY: Public key for RS256 (required if using RS256)
 * - AUTH_JWT_ISSUER: Optional issuer to validate
 * - AUTH_JWT_AUDIENCE: Optional audience to validate
 *
 * The port can be overridden per-app by providing a custom AUTH_PORT provider.
 * The factory will throw an error on startup if required environment variables are missing.
 */
@Global()
@Module({
  providers: [
    {
      provide: AUTH_PORT,
      useFactory: (): IAuthPort => {
        const logger = new Logger("AuthModule");
        try {
          return new JwtAuthPort();
        } catch (error: unknown) {
          logger.error("Failed to initialize JwtAuthPort. Check AUTH_JWT_* environment variables.", error);
          throw error;
        }
      },
    },
    AuthGuard,
  ],
  exports: [AUTH_PORT, AuthGuard],
})
export class AuthModule {}

export * from "./test-utils";
