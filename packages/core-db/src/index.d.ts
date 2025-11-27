import { Pool } from "pg";
export interface IDbClient {
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    transaction<T>(fn: (tx: IDbClient) => Promise<T>): Promise<T>;
}
export declare const DB_CLIENT: unique symbol;
export declare class PgDbClient implements IDbClient {
    private readonly pool;
    constructor(pool: Pool);
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    transaction<T>(fn: (tx: IDbClient) => Promise<T>): Promise<T>;
}
export interface DbModuleOptions {
    connectionString?: string;
    maxConnections?: number;
}
export declare const dbModuleOptionsToken: unique symbol;
export declare class DbModule {
    static forRoot(options?: DbModuleOptions): {
        module: typeof DbModule;
        providers: {
            provide: symbol;
            useValue: DbModuleOptions;
        }[];
    };
}
