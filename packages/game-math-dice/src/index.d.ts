export type DiceCondition = "over" | "under";
export interface DiceMathConfig {
    mathVersion: string;
    houseEdge: number;
    minTarget: number;
    maxTarget: number;
    maxMultiplier?: number;
}
export interface DiceBetInput {
    target: number;
    condition: DiceCondition;
}
export interface DiceEvaluationResult {
    rolled: number;
    win: boolean;
    multiplier: number;
    payout: bigint;
}
export declare class DiceMathEngine {
    private readonly config;
    constructor(config: DiceMathConfig);
    evaluate(betAmount: bigint, bet: DiceBetInput, rolled: number): DiceEvaluationResult;
    estimateMaxPayout(betAmount: bigint, bet: DiceBetInput): bigint;
    private validateBet;
    private didPlayerWin;
    private computeMultiplier;
}
