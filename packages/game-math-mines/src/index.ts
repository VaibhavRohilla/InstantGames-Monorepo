import { randomUUID } from "crypto";

export interface MinesConfig {
  rows: number;
  cols: number;
  mines: number;
  mathVersion: string;
}

export interface MinesState {
  roundId: string;
  cells: ("M" | "E")[];
  revealed: boolean[];
  betAmount: bigint;
  cashedOut: boolean;
  mathVersion: string;
}

export interface RevealResult {
  state: MinesState;
  win: bigint | null;
  busted: boolean;
}

export class MinesEngine {
  startRound(config: MinesConfig, bet: bigint): MinesState {
    const totalCells = config.rows * config.cols;
    if (config.mines >= totalCells) {
      throw new Error("INVALID_MINES_CONFIG");
    }
    return {
      roundId: randomUUID(),
      cells: Array.from({ length: totalCells }, (_, idx) => (idx < config.mines ? "M" : "E")),
      revealed: Array(totalCells).fill(false),
      betAmount: bet,
      cashedOut: false,
      mathVersion: config.mathVersion,
    };
  }

  revealCell(state: MinesState, index: number, nextRandom: number): RevealResult {
    if (state.cashedOut) throw new Error("ROUND_ALREADY_CASHED_OUT");
    if (state.revealed[index]) throw new Error("CELL_ALREADY_REVEALED");

    const clone: MinesState = {
      ...state,
      revealed: [...state.revealed],
    };
    clone.revealed[index] = true;
    const isMine = clone.cells[index] === "M";
    const busted = isMine;
    const multiplier = busted ? 0 : 1 + nextRandom;
    const win = busted ? BigInt(0) : BigInt(Math.floor(Number(clone.betAmount) * multiplier));

    return { state: clone, win: busted ? null : win, busted };
  }

  cashout(state: MinesState): { payout: bigint; state: MinesState } {
    if (state.cashedOut) throw new Error("ROUND_ALREADY_CASHED_OUT");
    const unrevealedCount = state.revealed.filter((v) => !v).length;
    const safeCells = state.cells.filter((c) => c === "E").length;
    const progress = safeCells - unrevealedCount;
    const multiplier = 1 + progress / safeCells;
    const payout = BigInt(Math.floor(Number(state.betAmount) * multiplier));
    return {
      payout,
      state: { ...state, cashedOut: true },
    };
  }
}
