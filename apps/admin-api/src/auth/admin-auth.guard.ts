import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const token = this.config?.get<string>("ADMIN_API_TOKEN") ?? process.env.ADMIN_API_TOKEN;
    if (!token) {
      throw new UnauthorizedException("Admin token not configured");
    }
    const provided = this.extractHeader(request.headers["x-admin-token"]);
    if (!provided || provided !== token) {
      throw new UnauthorizedException("Invalid admin token");
    }
    return true;
  }

  private extractHeader(value: string | string[] | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    return Array.isArray(value) ? value[0] : value;
  }
}

