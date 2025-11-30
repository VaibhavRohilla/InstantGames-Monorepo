import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, IsString, Min } from "class-validator";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { LedgerEntryDto, LedgerService } from "../services/ledger.service";
import { GameName } from "@instant-games/core-types";

class LedgerQueryDto {
  @IsString()
  operatorId!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  game?: string;

  @IsOptional()
  @IsString()
  roundId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

@Controller("admin/ledger")
@UseGuards(AdminAuthGuard)
export class LedgerController {
  constructor(@Inject(LedgerService) private readonly ledgerService: LedgerService) {}

  @Get()
  list(@Query() query: LedgerQueryDto): Promise<LedgerEntryDto[]> {
    return this.ledgerService.list({
      operatorId: query.operatorId,
      userId: query.userId,
      game: query.game as GameName,
      roundId: query.roundId,
      type: query.type,
      startTime: query.startTime ? new Date(query.startTime) : undefined,
      endTime: query.endTime ? new Date(query.endTime) : undefined,
      limit: clampLimit(query.limit),
    });
  }
}

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return 100;
  }
  return Math.max(1, Math.min(limit, 500));
}

