import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class HiloBetDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsInt()
  @Min(1)
  @Max(13)
  currentCard!: number;

  @IsIn(["higher", "lower"])
  choice!: "higher" | "lower";

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

