import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { KenoService } from "./keno.service";
import { KenoBetDto } from "./dto/keno-bet.dto";
import { KenoBetResponse } from "./dto/keno-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";

@Controller("keno")
@UseGuards(AuthGuard)
export class KenoController {
  constructor(@Inject(KenoService) private readonly kenoService: KenoService) {}

  @Post("bet")
  placeBet(
    @Auth() ctx: AuthContext,
    @Body() dto: KenoBetDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<KenoBetResponse> {
    return this.kenoService.placeBet(ctx, dto, idempotencyKey);
  }
}

