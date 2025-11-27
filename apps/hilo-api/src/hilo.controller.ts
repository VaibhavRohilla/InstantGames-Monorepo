import { BadRequestException, Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, CurrentUser } from "@instant-games/core-auth";
import { HiloService } from "./hilo.service";
import { HiloBetDto } from "./dto/hilo-bet.dto";
import { HiloBetResponse } from "./dto/hilo-response.dto";

@Controller("hilo")
@UseGuards(AuthGuard)
export class HiloController {
  constructor(@Inject(HiloService) private readonly hiloService: HiloService) {}

  @Post("bet")
  placeBet(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: HiloBetDto,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ): Promise<HiloBetResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException("x-idempotency-key header is required");
    }
    return this.hiloService.placeBet(ctx, dto, idempotencyKey);
  }
}

