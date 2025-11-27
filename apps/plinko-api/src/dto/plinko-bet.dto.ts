import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export class PlinkoBetDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsOptional()
  @IsIn(["low", "medium", "high"])
  risk?: "low" | "medium" | "high";

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

