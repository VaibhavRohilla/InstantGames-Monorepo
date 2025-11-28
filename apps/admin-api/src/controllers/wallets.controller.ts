import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { WalletBalanceDto, WalletsService } from "../services/wallets.service";
import { GameMode } from "@instant-games/core-types";

class WalletQueryDto {
  @IsString()
  operatorId!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  mode?: GameMode;
}

@Controller("admin/wallets")
@UseGuards(AdminAuthGuard)
export class WalletsController {
  constructor(@Inject(WalletsService) private readonly walletsService: WalletsService) {}

  @Get()
  list(@Query() query: WalletQueryDto): Promise<WalletBalanceDto[]> {
    return this.walletsService.search({
      operatorId: query.operatorId,
      userId: query.userId,
      currency: query.currency,
      mode: query.mode ,
    });
  }

  @Get(":operatorId/:userId/:currency/:mode")
  getWallet(
    @Param("operatorId") operatorId: string,
    @Param("userId") userId: string,
    @Param("currency") currency: string,
    @Param("mode") mode: GameMode
  ): Promise<WalletBalanceDto> {
    return this.walletsService.getBalance(operatorId, userId, currency, mode );
  }
}

