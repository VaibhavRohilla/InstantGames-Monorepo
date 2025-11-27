import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class KenoBetDto {
  @IsString()
  @Matches(/^(?!0+$)\d+$/, { message: "betAmount must be a positive integer string" })
  betAmount!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(80, { each: true })
  picks!: number[];

  @IsOptional()
  @IsString()
  clientSeed?: string;
}

