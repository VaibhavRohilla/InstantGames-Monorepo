import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class DiceBetDto {
  @IsString()
  @Matches(/^[0-9]+$/)
  betAmount!: string;

  @IsInt()
  @Min(2)
  @Max(98)
  target!: number;

  @IsIn(["over", "under"], { message: "condition must be 'over' or 'under'" })
  condition!: "over" | "under";

  @IsOptional()
  @IsString()
  clientSeed?: string;
}
