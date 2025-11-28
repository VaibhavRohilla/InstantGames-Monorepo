import { TEST_JWT_SECRET } from "./packages/core-auth/src/test-utils";

if (!process.env.AUTH_JWT_SECRET) {
  process.env.AUTH_JWT_SECRET = TEST_JWT_SECRET;
}

if (!process.env.AUTH_JWT_ALGO) {
  process.env.AUTH_JWT_ALGO = "HS256";
}

