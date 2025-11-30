import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthContext, Auth } from "@instant-games/core-auth";
import { HiloService } from "./hilo.service";
import { HiloStartDto } from "./dto/hilo-bet.dto";
import { HiloGuessDto } from "./dto/hilo-guess.dto";
import { HiloCashoutResponse, HiloGuessResponse, HiloStartResponse } from "./dto/hilo-response.dto";
import { IdempotencyKey } from "@instant-games/core-idempotency";
import { HiloRoundView } from "./hilo.types";

@Controller("hilo")
@UseGuards(AuthGuard)
export class HiloController {
  constructor(@Inject(HiloService) private readonly hiloService: HiloService) {}

  @Post("start")
  startRound(
    @Auth() ctx: AuthContext,
    @Body() dto: HiloStartDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<HiloStartResponse> {
    return this.hiloService.startRound(ctx, dto, idempotencyKey);
  }

  @Post("guess")
  guess(
    @Auth() ctx: AuthContext,
    @Body() dto: HiloGuessDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<HiloGuessResponse> {
    return this.hiloService.guess(ctx, dto, idempotencyKey);
  }

  @Post("cashout")
  cashout(@Auth() ctx: AuthContext, @IdempotencyKey() idempotencyKey: string): Promise<HiloCashoutResponse> {
    return this.hiloService.cashout(ctx, idempotencyKey);
  }

  @Get("round")
  activeRound(@Auth() ctx: AuthContext): Promise<HiloRoundView | null> {
    return this.hiloService.getActiveRound(ctx);
  }
}

