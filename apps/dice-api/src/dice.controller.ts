import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { DiceService } from "./dice.service";
import { DiceBetDto } from "./dto/dice-bet.dto";
import { DiceBetResponse } from "./dto/dice-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";

@Controller("dice")
@UseGuards(AuthGuard)
export class DiceController {
  constructor(@Inject(DiceService) private readonly diceService: DiceService) {}

  @Post("bet")
  placeBet(
    @Auth() ctx: AuthContext,
    @Body() dto: DiceBetDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<DiceBetResponse> {
    return this.diceService.placeBet(ctx, dto, idempotencyKey);
  }
}
