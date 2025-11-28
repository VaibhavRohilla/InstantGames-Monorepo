import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { CoinflipService } from "./coinflip.service";
import { CoinflipBetDto } from "./dto/coinflip-bet.dto";
import { CoinflipBetResponse } from "./dto/coinflip-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";

@Controller("coinflip")
@UseGuards(AuthGuard)
export class CoinflipController {
  constructor(@Inject(CoinflipService) private readonly coinflipService: CoinflipService) {}

  @Post("bet")
  placeBet(
    @Auth() ctx: AuthContext,
    @Body() dto: CoinflipBetDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<CoinflipBetResponse> {
    return this.coinflipService.placeBet(ctx, dto, idempotencyKey);
  }
}

