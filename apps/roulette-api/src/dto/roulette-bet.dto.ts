import { IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class RouletteBetDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsInt()
  @Min(0)
  @Max(9)
  selection!: number;

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

