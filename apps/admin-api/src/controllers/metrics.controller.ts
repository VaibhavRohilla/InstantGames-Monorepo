import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { register } from "prom-client";
import { AdminAuthGuard } from "../auth/admin-auth.guard";

@Controller()
@UseGuards(AdminAuthGuard)
export class MetricsController {
  @Get("metrics")
  @Header("Content-Type", "text/plain")
  async metrics(): Promise<string> {
    return register.metrics();
  }
}

