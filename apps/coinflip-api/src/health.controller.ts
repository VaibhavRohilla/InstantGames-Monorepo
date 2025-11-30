import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("coinflip/health")
  health() {
    return { status: "ok" };
  }
}

