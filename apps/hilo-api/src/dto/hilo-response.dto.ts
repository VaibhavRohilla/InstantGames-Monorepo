import { Card } from "@instant-games/game-math-hilo";
import { HiloRoundView } from "../hilo.types";

export interface HiloStartResponse extends HiloRoundView {}

export interface HiloGuessResponse extends HiloRoundView {
  nextCard: Card;
  result: "win" | "lose";
  sameRankDifferentSuit: boolean;
}

export interface HiloCashoutResponse extends HiloRoundView {
  winAmount: string;
}

