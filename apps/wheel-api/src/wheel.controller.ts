import { BadRequestException, Body, Controller, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, CurrentUser } from "@instant-games/core-auth";
import { WheelService } from "./wheel.service";
import { WheelBetDto } from "./dto/wheel-bet.dto";
import { WheelBetResponse } from "./dto/wheel-response.dto";

@Controller("wheel")
@UseGuards(AuthGuard)
export class WheelController {
  constructor(@Inject(WheelService) private readonly wheelService: WheelService) {}

  @Post("bet")
  placeBet(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: WheelBetDto,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ): Promise<WheelBetResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException("x-idempotency-key header is required");
    }
    return this.wheelService.placeBet(ctx, dto, idempotencyKey);
  }
}

