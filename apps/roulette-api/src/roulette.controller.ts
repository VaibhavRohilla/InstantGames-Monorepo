import { BadRequestException, Body, Controller, Inject, Post, Headers, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, CurrentUser } from "@instant-games/core-auth";
import { RouletteService } from "./roulette.service";
import { RouletteBetDto } from "./dto/roulette-bet.dto";
import { RouletteBetResponse } from "./dto/roulette-response.dto";

@Controller("roulette")
@UseGuards(AuthGuard)
export class RouletteController {
  constructor(@Inject(RouletteService) private readonly rouletteService: RouletteService) {}

  @Post("bet")
  placeBet(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: RouletteBetDto,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ): Promise<RouletteBetResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException("x-idempotency-key header is required");
    }
    return this.rouletteService.placeBet(ctx, dto, idempotencyKey);
  }
}

