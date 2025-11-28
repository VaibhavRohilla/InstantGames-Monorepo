import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { RouletteService } from "./roulette.service";
import { RouletteBetDto } from "./dto/roulette-bet.dto";
import { RouletteBetResponse } from "./dto/roulette-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";

@Controller("roulette")
@UseGuards(AuthGuard)
export class RouletteController {
  constructor(@Inject(RouletteService) private readonly rouletteService: RouletteService) {}

  @Post("bet")
  placeBet(
    @Auth() ctx: AuthContext,
    @Body() dto: RouletteBetDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<RouletteBetResponse> {
    return this.rouletteService.placeBet(ctx, dto, idempotencyKey);
  }
}

