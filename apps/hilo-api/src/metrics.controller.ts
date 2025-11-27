import { Controller, Get, Header } from "@nestjs/common";
import { register } from "prom-client";

@Controller()
export class MetricsController {
  @Get("metrics")
  @Header("Content-Type", "text/plain")
  async metrics(): Promise<string> {
    return register.metrics();
  }
}

