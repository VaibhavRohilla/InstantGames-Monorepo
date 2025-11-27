// NOTE: Stub math implementation for prototyping only; not production-ready.
export interface WheelSegment {
  label: string;
  multiplier: number;
  weight: number;
}

export interface WheelConfig {
  mathVersion: string;
  segments: WheelSegment[];
}

export interface WheelResult {
  segment: WheelSegment;
  payout: bigint;
}

export class WheelEngine {
  constructor(private readonly config: WheelConfig) {}

  evaluate(betAmount: bigint, randomFloat: number): WheelResult {
    const totalWeight = this.config.segments.reduce((sum, segment) => sum + segment.weight, 0);
    let cursor = randomFloat * totalWeight;
    for (const segment of this.config.segments) {
      if ((cursor -= segment.weight) <= 0) {
        return { segment, payout: BigInt(Math.floor(Number(betAmount) * segment.multiplier)) };
      }
    }
    const fallback = this.config.segments[this.config.segments.length - 1];
    return { segment: fallback, payout: BigInt(Math.floor(Number(betAmount) * fallback.multiplier)) };
  }
}
