import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { KEY_VALUE_STORE, IKeyValueStore } from "@instant-games/core-redis";
import { WALLET_ROUTER, WalletRouter, scopeWalletUserId } from "@instant-games/core-wallet";

interface HealthCheckResult {
  ok: boolean;
  error?: string;
}

@Controller()
export class HealthController {
  private static readonly HEALTH_OPERATOR = "coinflip-health";
  private static readonly HEALTH_USER = "probe";
  private static readonly HEALTH_CURRENCY = process.env.COINFLIP_HEALTH_CURRENCY ?? "USD";
  private readonly walletProbeUserId = scopeWalletUserId(HealthController.HEALTH_OPERATOR, HealthController.HEALTH_USER);

  constructor(
    @Inject(DB_CLIENT) private readonly db: IDbClient,
    @Inject(KEY_VALUE_STORE) private readonly kvStore: IKeyValueStore,
    @Inject(WALLET_ROUTER) private readonly walletRouter: WalletRouter,
  ) {}

  @Get("coinflip/health")
  async health() {
    const checks: Record<string, HealthCheckResult> = {
      database: await this.runCheck(() => this.db.query("SELECT 1")),
      redis: await this.runCheck(() => this.probeRedis()),
      wallet: await this.runCheck(() => this.probeWallet()),
    };

    const unhealthy = Object.values(checks).filter((result) => !result.ok);
    if (unhealthy.length) {
      throw new ServiceUnavailableException({ status: "error", checks });
    }

    return { status: "ok", checks };
  }

  private async runCheck(fn: () => Promise<unknown>): Promise<HealthCheckResult> {
    try {
      await fn();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async probeRedis(): Promise<void> {
    const key = `health:coinflip:${randomUUID()}`;
    await this.kvStore.set(key, { ok: true }, 5);
    await this.kvStore.del(key);
  }

  private async probeWallet(): Promise<void> {
    const wallet = this.walletRouter.resolve("demo");
    await wallet.getBalance(this.walletProbeUserId, HealthController.HEALTH_CURRENCY, "demo");
  }
}

