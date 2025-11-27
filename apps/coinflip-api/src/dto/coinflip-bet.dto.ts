import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export class CoinflipBetDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsIn(["heads", "tails"])
  choice!: "heads" | "tails";

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

