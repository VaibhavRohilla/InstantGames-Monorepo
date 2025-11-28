import * as jwt from "jsonwebtoken";
import type { GameMode } from "@instant-games/core-types";

export interface TestTokenOptions {
  userId?: string;
  operatorId?: string;
  currency?: string;
  mode?: GameMode;
  brandId?: string;
  country?: string;
  isTestUser?: boolean;
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  metadata?: Record<string, unknown>;
}

export function createTestToken(secret: string, options: TestTokenOptions = {}): string {
  if (!secret) {
    throw new Error("JWT secret is required to generate test tokens");
  }

  const payload: jwt.JwtPayload = {
    sub: options.userId ?? "test-user",
    operatorId: options.operatorId ?? "test-operator",
    currency: options.currency ?? "USD",
    mode: options.mode ?? "demo",
    brandId: options.brandId,
    country: options.country,
    isTestUser: options.isTestUser,
    ...options.metadata,
  };

  const signOptions: jwt.SignOptions = {
    algorithm: "HS256",
    expiresIn: (options.expiresIn ?? "1h") as jwt.SignOptions["expiresIn"],
  };

  if (options.issuer) {
    signOptions.issuer = options.issuer;
  }

  if (options.audience) {
    signOptions.audience = options.audience;
  }

  return jwt.sign(payload, secret, signOptions);
}

export const TEST_JWT_SECRET = "test-jwt-secret-for-development-only";

