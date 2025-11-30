import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class HiloBetDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsInt()
  @Min(1)
  @Max(13)
  currentRank!: number;

  @IsString()
  @Matches(/^(higher|lower)$/i, { message: "choice must be 'higher' or 'lower'" })
  choice!: string;

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

