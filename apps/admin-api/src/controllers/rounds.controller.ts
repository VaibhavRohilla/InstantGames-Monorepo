import { Controller, Get, Inject, NotFoundException, Param, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, IsString, Min } from "class-validator";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AdminRoundDto, RoundsService } from "../services/rounds.service";

class ListRoundsDto {
  @IsString()
  operatorId!: string;

  @IsString()
  game!: string;

  @IsString()
  mode!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  cursor?: string;
}

@Controller("admin/rounds")
@UseGuards(AdminAuthGuard)
export class RoundsController {
  constructor(@Inject(RoundsService) private readonly roundsService: RoundsService) {}

  @Get()
  list(@Query() query: ListRoundsDto): Promise<AdminRoundDto[]> {
    const cursorDate = query.cursor ? new Date(query.cursor) : undefined;
    return this.roundsService.list({
      operatorId: query.operatorId,
      game: query.game as any,
      mode: query.mode as any,
      userId: query.userId,
      cursor: cursorDate,
      limit: clampLimit(query.limit),
    });
  }

  @Get(":id")
  async getRound(@Param("id") id: string): Promise<AdminRoundDto> {
    const round = await this.roundsService.findById(id);
    if (!round) {
      throw new NotFoundException("Round not found");
    }
    return round;
  }
}

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return 50;
  }
  return Math.max(1, Math.min(limit, 200));
}

