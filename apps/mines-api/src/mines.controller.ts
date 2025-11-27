import { BadRequestException, Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, CurrentUser } from "@instant-games/core-auth";
import { MinesService } from "./mines.service";
import { MinesBetDto } from "./dto/mines-bet.dto";
import { MinesBetResponse } from "./dto/mines-response.dto";

@Controller("mines")
@UseGuards(AuthGuard)
export class MinesController {
  constructor(@Inject(MinesService) private readonly minesService: MinesService) {}

  @Post("bet")
  placeBet(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: MinesBetDto,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ): Promise<MinesBetResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException("x-idempotency-key header is required");
    }
    return this.minesService.placeBet(ctx, dto, idempotencyKey);
  }
}

