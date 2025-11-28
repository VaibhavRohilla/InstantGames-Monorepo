import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("dice/health")
  health() {
    return { status: "ok" };
  }
}

