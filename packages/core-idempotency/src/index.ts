import { BadRequestException, ExecutionContext, createParamDecorator } from "@nestjs/common";
import { IKeyValueStore } from "@instant-games/core-redis";
import { RgsErrorCode, rgsErrorPayload } from "@instant-games/core-errors";

export interface PerformOptions<T> {
  onCached?: (cached: T) => void;
}

export interface IIdempotencyStore {
  performOrGetCached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>, options?: PerformOptions<T>): Promise<T>;
}

export const IDEMPOTENCY_STORE = Symbol("IDEMPOTENCY_STORE");
export const IDEMPOTENCY_HEADER = "x-idempotency-key";

export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
  const header = request.headers[IDEMPOTENCY_HEADER] ?? request.headers[IDEMPOTENCY_HEADER.toLowerCase()];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new BadRequestException(
      rgsErrorPayload(RgsErrorCode.IDEMPOTENCY_KEY_MISSING, `Header ${IDEMPOTENCY_HEADER} is required for this endpoint`),
    );
  }
  return value;
});

export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly store: IKeyValueStore, private readonly pollIntervalMs = 50) {}

  async performOrGetCached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>, options?: PerformOptions<T>): Promise<T> {
    const cacheKey = `idem:${key}`;
    const lockKey = `idem:lock:${key}`;

    const cached = await this.store.get<{ payload: T }>(cacheKey);
    if (cached) {
      options?.onCached?.(cached.payload);
      return cached.payload;
    }

    const acquired = await this.store.setNx(lockKey, "1", ttlSeconds);
    if (!acquired) {
      const timeoutAt = Date.now() + ttlSeconds * 1000;
      while (Date.now() < timeoutAt) {
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        const existing = await this.store.get<{ payload: T }>(cacheKey);
        if (existing) {
          return existing.payload;
        }
      }
      throw new Error("IDEMPOTENCY_IN_PROGRESS");
    }

    try {
      const result = await fn();
      await this.store.set(cacheKey, { payload: result }, ttlSeconds);
      return result;
    } finally {
      await this.store.del(lockKey);
    }
  }
}
