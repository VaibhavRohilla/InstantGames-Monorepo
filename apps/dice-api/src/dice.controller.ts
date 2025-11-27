import { Body, Controller, Get, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, CurrentUser } from "@instant-games/core-auth";
import { DiceService } from "./dice.service";
import { DiceBetDto } from "./dto/dice-bet.dto";
import { DiceBetResponse } from "./dto/dice-response.dto";

@Controller("dice")
@UseGuards(AuthGuard)
export class DiceController {
  constructor(@Inject(DiceService) private readonly diceService: DiceService) {}

  @Get("health")
  health() {
    return { status: "ok" };
  }

  @Post("bet")
  placeBet(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: DiceBetDto,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ): Promise<DiceBetResponse> {
    return this.diceService.placeBet(ctx, dto, idempotencyKey);
  }
}
