import { BadRequestException, Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, CurrentUser } from "@instant-games/core-auth";
import { KenoService } from "./keno.service";
import { KenoBetDto } from "./dto/keno-bet.dto";
import { KenoBetResponse } from "./dto/keno-response.dto";

@Controller("keno")
@UseGuards(AuthGuard)
export class KenoController {
  constructor(@Inject(KenoService) private readonly kenoService: KenoService) {}

  @Post("bet")
  placeBet(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: KenoBetDto,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ): Promise<KenoBetResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException("x-idempotency-key header is required");
    }
    return this.kenoService.placeBet(ctx, dto, idempotencyKey);
  }
}

