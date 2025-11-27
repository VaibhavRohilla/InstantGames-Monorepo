"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggingModule = exports.CorrelationIdInterceptor = exports.PinoLogger = exports.LOGGER = void 0;
const common_1 = require("@nestjs/common");
const pino_1 = __importDefault(require("pino"));
const crypto_1 = require("crypto");
const rxjs_1 = require("rxjs");
exports.LOGGER = Symbol("LOGGER");
class PinoLogger {
    logger;
    constructor() {
        this.logger = (0, pino_1.default)({ level: process.env.LOG_LEVEL ?? "info" });
    }
    info(msg, meta = {}) {
        this.logger.info(meta, msg);
    }
    warn(msg, meta = {}) {
        this.logger.warn(meta, msg);
    }
    error(msg, meta = {}) {
        this.logger.error(meta, msg);
    }
}
exports.PinoLogger = PinoLogger;
let CorrelationIdInterceptor = class CorrelationIdInterceptor {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    intercept(context, next) {
        const http = context.switchToHttp();
        const request = http.getRequest();
        const response = http.getResponse();
        const traceIdHeader = request.headers["x-trace-id"];
        const traceId = Array.isArray(traceIdHeader) ? traceIdHeader[0] : traceIdHeader ?? (0, crypto_1.randomUUID)();
        request.traceId = traceId;
        if (typeof response.setHeader === "function") {
            response.setHeader("x-trace-id", traceId);
        }
        const start = Date.now();
        return next.handle().pipe((0, rxjs_1.tap)({
            next: () => this.logger.info("request.completed", { traceId, durationMs: Date.now() - start }),
            error: (err) => this.logger.error("request.error", { traceId, durationMs: Date.now() - start, err: err?.message }),
        }));
    }
};
exports.CorrelationIdInterceptor = CorrelationIdInterceptor;
exports.CorrelationIdInterceptor = CorrelationIdInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(exports.LOGGER)),
    __metadata("design:paramtypes", [Object])
], CorrelationIdInterceptor);
let LoggingModule = class LoggingModule {
};
exports.LoggingModule = LoggingModule;
exports.LoggingModule = LoggingModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.LOGGER,
                useClass: PinoLogger,
            },
            CorrelationIdInterceptor,
        ],
        exports: [exports.LOGGER, CorrelationIdInterceptor],
    })
], LoggingModule);
