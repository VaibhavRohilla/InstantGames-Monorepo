import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Pool } from "pg";

export interface IDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  transaction<T>(fn: (tx: IDbClient) => Promise<T>): Promise<T>;
}

export const DB_CLIENT = Symbol("DB_CLIENT");

export class PgDbClient implements IDbClient {
  constructor(private readonly pool: Pool) {}

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async transaction<T>(fn: (tx: IDbClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const txClient: IDbClient = {
        query: async <T = any>(sql: string, params: any[] = []) => {
          const result = await client.query(sql, params);
          return result.rows as T[];
        },
        transaction: async () => {
          throw new Error("Nested transactions are not supported in PgDbClient");
        },
      };
      const result = await fn(txClient);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

export interface DbModuleOptions {
  connectionString?: string;
  maxConnections?: number;
}

export const dbModuleOptionsToken = Symbol("DB_MODULE_OPTIONS");

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    {
      provide: DB_CLIENT,
      inject: [ConfigService, dbModuleOptionsToken],
      useFactory: (config: ConfigService, options?: DbModuleOptions) => {
        const connectionString = options?.connectionString ?? config.get<string>("DATABASE_URL");
        if (!connectionString) {
          throw new Error("DATABASE_URL is not configured");
        }
        const pool = new Pool({
          connectionString,
          max: options?.maxConnections ?? (Number(config.get("DB_MAX_CONNECTIONS")) || 10),
        });
        return new PgDbClient(pool);
      },
    },
  ],
  exports: [DB_CLIENT],
})
export class DbModule {
  static forRoot(options?: DbModuleOptions) {
    return {
      module: DbModule,
      providers: [
        {
          provide: dbModuleOptionsToken,
          useValue: options ?? {},
        },
      ],
    };
  }
}
