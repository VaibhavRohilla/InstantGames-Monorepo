export enum RgsErrorCode {
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  AUTH_FAILED = "AUTH_FAILED",
  IDEMPOTENCY_KEY_MISSING = "IDEMPOTENCY_KEY_MISSING",
  MODE_DISABLED = "MODE_DISABLED",
  BET_UNDER_MIN_LIMIT = "BET_UNDER_MIN_LIMIT",
  BET_OVER_MAX_LIMIT = "BET_OVER_MAX_LIMIT",
  PAYOUT_OVER_LIMIT = "PAYOUT_OVER_LIMIT",
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  LIMIT_VIOLATION = "LIMIT_VIOLATION",
}

export interface RgsErrorPayload {
  error: RgsErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export class RgsError extends Error {
  constructor(public readonly code: RgsErrorCode, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "RgsError";
  }
}

export function rgsErrorPayload(code: RgsErrorCode, message: string, details?: Record<string, unknown>): RgsErrorPayload {
  return { error: code, message, details };
}

