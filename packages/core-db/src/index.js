"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DbModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DbModule = exports.dbModuleOptionsToken = exports.PgDbClient = exports.DB_CLIENT = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
exports.DB_CLIENT = Symbol("DB_CLIENT");
class PgDbClient {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async query(sql, params = []) {
        const result = await this.pool.query(sql, params);
        return result.rows;
    }
    async transaction(fn) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const txClient = {
                query: async (sql, params = []) => {
                    const result = await client.query(sql, params);
                    return result.rows;
                },
                transaction: async () => {
                    throw new Error("Nested transactions are not supported in PgDbClient");
                },
            };
            const result = await fn(txClient);
            await client.query("COMMIT");
            return result;
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
}
exports.PgDbClient = PgDbClient;
exports.dbModuleOptionsToken = Symbol("DB_MODULE_OPTIONS");
let DbModule = DbModule_1 = class DbModule {
    static forRoot(options) {
        return {
            module: DbModule_1,
            providers: [
                {
                    provide: exports.dbModuleOptionsToken,
                    useValue: options ?? {},
                },
            ],
        };
    }
};
exports.DbModule = DbModule;
exports.DbModule = DbModule = DbModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [config_1.ConfigModule.forRoot({ isGlobal: true })],
        providers: [
            {
                provide: exports.DB_CLIENT,
                inject: [config_1.ConfigService, exports.dbModuleOptionsToken],
                useFactory: (config, options) => {
                    const connectionString = options?.connectionString ?? config.get("DATABASE_URL");
                    if (!connectionString) {
                        throw new Error("DATABASE_URL is not configured");
                    }
                    const pool = new pg_1.Pool({
                        connectionString,
                        max: options?.maxConnections ?? (Number(config.get("DB_MAX_CONNECTIONS")) || 10),
                    });
                    return new PgDbClient(pool);
                },
            },
        ],
        exports: [exports.DB_CLIENT],
    })
], DbModule);
