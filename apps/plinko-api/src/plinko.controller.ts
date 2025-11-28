import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { PlinkoService } from "./plinko.service";
import { PlinkoBetDto } from "./dto/plinko-bet.dto";
import { PlinkoBetResponse } from "./dto/plinko-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";

@Controller("plinko")
@UseGuards(AuthGuard)
export class PlinkoController {
  constructor(@Inject(PlinkoService) private readonly plinkoService: PlinkoService) {}

  @Post("bet")
  placeBet(
    @Auth() ctx: AuthContext,
    @Body() dto: PlinkoBetDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<PlinkoBetResponse> {
    return this.plinkoService.placeBet(ctx, dto, idempotencyKey);
  }
}

