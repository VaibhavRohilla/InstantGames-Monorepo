import { IsString, Matches } from "class-validator";

export class HiloGuessDto {
  @IsString()
  @Matches(/^(higher|lower)$/i, { message: "direction must be 'higher' or 'lower'" })
  direction!: string;
}


