import { BadRequestException, Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, CurrentUser } from "@instant-games/core-auth";
import { CoinflipService } from "./coinflip.service";
import { CoinflipBetDto } from "./dto/coinflip-bet.dto";
import { CoinflipBetResponse } from "./dto/coinflip-response.dto";

@Controller("coinflip")
@UseGuards(AuthGuard)
export class CoinflipController {
  constructor(@Inject(CoinflipService) private readonly coinflipService: CoinflipService) {}

  @Post("bet")
  placeBet(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: CoinflipBetDto,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ): Promise<CoinflipBetResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException("x-idempotency-key header is required");
    }
    return this.coinflipService.placeBet(ctx, dto, idempotencyKey);
  }
}

