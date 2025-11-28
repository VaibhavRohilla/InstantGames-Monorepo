import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { MinesService } from "./mines.service";
import { MinesBetDto } from "./dto/mines-bet.dto";
import { MinesBetResponse } from "./dto/mines-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";

@Controller("mines")
@UseGuards(AuthGuard)
export class MinesController {
  constructor(@Inject(MinesService) private readonly minesService: MinesService) {}

  @Post("bet")
  placeBet(
    @Auth() ctx: AuthContext,
    @Body() dto: MinesBetDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<MinesBetResponse> {
    return this.minesService.placeBet(ctx, dto, idempotencyKey);
  }
}

