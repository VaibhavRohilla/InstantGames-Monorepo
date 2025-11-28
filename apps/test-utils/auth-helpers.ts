/**
 * Authentication helpers for tests
 * Provides utilities to generate JWT tokens for test requests
 */

import type { GameMode } from "@instant-games/core-types";
import { createTestToken, TEST_JWT_SECRET } from "../../packages/core-auth/src/test-utils";

/**
 * Creates a JWT token for use in test requests
 *
 * @param options - Token options (userId, operatorId, mode, etc.)
 * @returns JWT token string
 *
 * @example
 * ```typescript
 * const token = createTestAuthToken({
 *   userId: "user123",
 *   operatorId: "op1",
 *   currency: "USD",
 *   mode: "demo"
 * });
 *
 * request(app.getHttpServer())
 *   .post("/dice/bet")
 *   .set("Authorization", `Bearer ${token}`)
 *   .send({...})
 * ```
 */
export function createTestAuthToken(options: {
  userId?: string;
  operatorId?: string;
  currency?: string;
  mode?: GameMode;
  brandId?: string;
  country?: string;
  isTestUser?: boolean;
  expiresIn?: string | number;
} = {}): string {
  // Use test secret - should match TEST_JWT_SECRET from test-helpers
  const secret = process.env.AUTH_JWT_SECRET || TEST_JWT_SECRET;
  return createTestToken(secret, options);
}

