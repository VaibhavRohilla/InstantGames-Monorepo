import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { WheelService } from "./wheel.service";
import { WheelBetDto } from "./dto/wheel-bet.dto";
import { WheelBetResponse } from "./dto/wheel-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";

@Controller("wheel")
@UseGuards(AuthGuard)
export class WheelController {
  constructor(@Inject(WheelService) private readonly wheelService: WheelService) {}

  @Post("bet")
  placeBet(
    @Auth() ctx: AuthContext,
    @Body() dto: WheelBetDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<WheelBetResponse> {
    return this.wheelService.placeBet(ctx, dto, idempotencyKey);
  }
}

