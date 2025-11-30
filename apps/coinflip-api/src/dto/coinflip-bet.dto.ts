import { IsOptional, IsString, Matches } from "class-validator";

export class CoinflipBetDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsString()
  @Matches(/^(heads|tails)$/i, { message: "side must be 'heads' or 'tails'" })
  side!: string;

  @IsOptional()
  @IsString()
  clientSeed?: string;
}
