import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("hilo/health")
  health() {
    return { status: "ok" };
  }
}

