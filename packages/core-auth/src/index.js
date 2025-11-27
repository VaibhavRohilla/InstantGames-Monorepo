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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = exports.CurrentUser = exports.AuthGuard = exports.DummyAuthPort = exports.AUTH_CONTEXT_REQUEST_KEY = exports.AUTH_PORT = void 0;
const common_1 = require("@nestjs/common");
exports.AUTH_PORT = Symbol("AUTH_PORT");
exports.AUTH_CONTEXT_REQUEST_KEY = "authContext";
class DummyAuthPort {
    async verifyToken(token) {
        if (!token) {
            throw new common_1.UnauthorizedException("Missing token");
        }
        const payload = this.tryParseToken(token);
        if (!payload) {
            throw new common_1.UnauthorizedException("Invalid dummy token");
        }
        return this.normalizePayload(payload);
    }
    async verifyFromHeaders(headers) {
        const userId = this.pickHeader(headers, "x-user-id") ?? "demo-user";
        const operatorId = this.pickHeader(headers, "x-operator-id") ?? "demo-op";
        const currency = this.pickHeader(headers, "x-currency") ?? "USD";
        const mode = (this.pickHeader(headers, "x-game-mode") ?? "demo");
        const brandId = this.pickHeader(headers, "x-brand-id");
        const country = this.pickHeader(headers, "x-country");
        const metadataHeader = this.pickHeader(headers, "x-user-metadata");
        return {
            userId,
            operatorId,
            brandId,
            country,
            currency,
            mode,
            metadata: metadataHeader ? this.tryJson(metadataHeader) : undefined,
        };
    }
    pickHeader(headers, key) {
        const raw = headers[key];
        if (!raw)
            return undefined;
        return Array.isArray(raw) ? raw[0] : raw;
    }
    tryParseToken(token) {
        try {
            const decoded = Buffer.from(token.replace(/^Bearer\s+/i, ""), "base64url").toString("utf-8");
            return JSON.parse(decoded);
        }
        catch (err) {
            return null;
        }
    }
    tryJson(value) {
        try {
            return JSON.parse(value);
        }
        catch {
            return undefined;
        }
    }
    normalizePayload(payload) {
        const mode = (payload.mode ?? payload["gameMode"] ?? "demo");
        if (!payload.userId || !payload.operatorId || !payload.currency) {
            throw new common_1.UnauthorizedException("Incomplete dummy token payload");
        }
        return {
            userId: String(payload.userId),
            operatorId: String(payload.operatorId),
            brandId: payload.brandId ? String(payload.brandId) : undefined,
            isTestUser: Boolean(payload.isTestUser ?? false),
            country: payload.country ? String(payload.country) : undefined,
            currency: String(payload.currency),
            mode,
            metadata: typeof payload.metadata === "object" ? payload.metadata : undefined,
        };
    }
}
exports.DummyAuthPort = DummyAuthPort;
let AuthGuard = class AuthGuard {
    authPort;
    constructor(authPort) {
        this.authPort = authPort;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = this.extractToken(request);
        let authContext = null;
        if (token) {
            authContext = await this.authPort.verifyToken(token);
        }
        else if (isHeaderAware(this.authPort)) {
            authContext = await this.authPort.verifyFromHeaders(request.headers);
        }
        if (!authContext) {
            throw new common_1.UnauthorizedException("Unable to resolve auth context");
        }
        request[exports.AUTH_CONTEXT_REQUEST_KEY] = authContext;
        return true;
    }
    extractToken(request) {
        const authHeader = request.headers["authorization"];
        if (!authHeader)
            return null;
        return Array.isArray(authHeader) ? authHeader[0] : authHeader;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(exports.AUTH_PORT)),
    __metadata("design:paramtypes", [Object])
], AuthGuard);
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request[exports.AUTH_CONTEXT_REQUEST_KEY];
    if (!user) {
        throw new common_1.UnauthorizedException("Auth context missing in request");
    }
    return user;
});
function isHeaderAware(port) {
    return typeof port.verifyFromHeaders === "function";
}
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.AUTH_PORT,
                useClass: DummyAuthPort,
            },
            AuthGuard,
        ],
        exports: [exports.AUTH_PORT, AuthGuard],
    })
], AuthModule);
