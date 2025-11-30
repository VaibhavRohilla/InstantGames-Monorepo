import { IsOptional, IsString, Matches } from "class-validator";

export class HiloStartDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsOptional()
  @IsString()
  clientSeed?: string;
}
