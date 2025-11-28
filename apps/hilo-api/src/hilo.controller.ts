import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { HiloService } from "./hilo.service";
import { HiloBetDto } from "./dto/hilo-bet.dto";
import { HiloBetResponse } from "./dto/hilo-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";

@Controller("hilo")
@UseGuards(AuthGuard)
export class HiloController {
  constructor(@Inject(HiloService) private readonly hiloService: HiloService) {}

  @Post("bet")
  placeBet(
    @Auth() ctx: AuthContext,
    @Body() dto: HiloBetDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<HiloBetResponse> {
    return this.hiloService.placeBet(ctx, dto, idempotencyKey);
  }
}

