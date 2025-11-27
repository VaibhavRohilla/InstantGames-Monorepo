import { BadRequestException, Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, CurrentUser } from "@instant-games/core-auth";
import { PlinkoService } from "./plinko.service";
import { PlinkoBetDto } from "./dto/plinko-bet.dto";
import { PlinkoBetResponse } from "./dto/plinko-response.dto";

@Controller("plinko")
@UseGuards(AuthGuard)
export class PlinkoController {
  constructor(@Inject(PlinkoService) private readonly plinkoService: PlinkoService) {}

  @Post("bet")
  placeBet(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: PlinkoBetDto,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ): Promise<PlinkoBetResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException("x-idempotency-key header is required");
    }
    return this.plinkoService.placeBet(ctx, dto, idempotencyKey);
  }
}

