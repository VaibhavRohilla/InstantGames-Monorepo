import { IsInt, IsOptional, IsString, Matches, Min } from "class-validator";

export class MinesBetDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsInt()
  @Min(0)
  cell!: number;

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

