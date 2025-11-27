import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { IPfRotationService, PF_ROTATION_SERVICE, PfSeedHistory } from "@instant-games/core-provably-fair";

class PfSeedsQueryDto {
  @IsString()
  operatorId!: string;

  @IsString()
  game!: string;

  @IsString()
  mode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

class PfRotateDto {
  @IsString()
  operatorId!: string;

  @IsString()
  game!: string;

  @IsString()
  mode!: string;
}

@Controller("admin/pf")
@UseGuards(AdminAuthGuard)
export class PfController {
  constructor(@Inject(PF_ROTATION_SERVICE) private readonly rotationService: IPfRotationService) {}

  @Get("seeds")
  listSeeds(@Query() query: PfSeedsQueryDto): Promise<PfSeedHistory[]> {
    return this.rotationService.getSeedHistory({
      operatorId: query.operatorId,
      game: query.game as any,
      mode: query.mode as any,
      limit: query.limit ?? 20,
    });
  }

  @Post("rotate")
  async rotate(@Body() dto: PfRotateDto) {
    const seed = await this.rotationService.rotateServerSeed({
      operatorId: dto.operatorId,
      game: dto.game as any,
      mode: dto.mode as any,
    });
    return {
      id: seed.id,
      serverSeedHash: seed.serverSeedHash,
      createdAt: seed.createdAt.toISOString(),
    };
  }
}

