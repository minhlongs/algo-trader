import {
  BinaryOptionPricingInput,
  BinaryPricingResult,
  CexTick,
  ToxicFlowAnalysis,
} from './polymarket-statarb-types';

export function standardNormalCdf(x: number): number {
  if (isNaN(x)) return 0.5;
  if (x < -8.0) return 0.0;
  if (x > 8.0) return 1.0;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

export function computeBinaryOptionProbability(
  input: BinaryOptionPricingInput
): BinaryPricingResult {
  const { spotPrice, strikePrice, timeToExpiryYears, volatility, riskFreeRate = 0 } = input;

  if (timeToExpiryYears <= 0 || volatility <= 0) {
    const isITM = spotPrice >= strikePrice ? 1.0 : 0.0;
    return {
      binaryCallProbability: isITM,
      binaryPutProbability: 1.0 - isITM,
      d1: spotPrice >= strikePrice ? 100 : -100,
      d2: spotPrice >= strikePrice ? 100 : -100,
    };
  }

  const sqrtT = Math.sqrt(timeToExpiryYears);
  const numerator = Math.log(spotPrice / strikePrice) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiryYears;
  const d1 = numerator / (volatility * sqrtT);
  const d2 = d1 - volatility * sqrtT;

  const binaryCallProb = Math.min(1.0, Math.max(0.0, standardNormalCdf(d2)));
  const binaryPutProb = Math.min(1.0, Math.max(0.0, 1.0 - binaryCallProb));

  return {
    binaryCallProbability: Number(binaryCallProb.toFixed(6)),
    binaryPutProbability: Number(binaryPutProb.toFixed(6)),
    d1: Number(d1.toFixed(6)),
    d2: Number(d2.toFixed(6)),
  };
}

export class CexVelocityDetector {
  private readonly maxWindowMs: number;
  private readonly toxicThreshold: number;
  private tickHistory: CexTick[] = [];

  constructor(maxWindowMs = 5000, toxicThreshold = 0.002) {
    this.maxWindowMs = maxWindowMs;
    this.toxicThreshold = toxicThreshold;
  }

  public recordTick(tick: CexTick): void {
    this.tickHistory.push(tick);
    const cutoff = tick.timestampMs - this.maxWindowMs;
    this.tickHistory = this.tickHistory.filter((t) => t.timestampMs >= cutoff);
  }

  public analyzeFlow(nowMs?: number): ToxicFlowAnalysis {
    if (this.tickHistory.length < 2) {
      return {
        velocity: 0,
        acceleration: 0,
        isToxic: false,
        skewDirection: 'NEUTRAL',
        flowSeverity: 0,
      };
    }

    const latest = this.tickHistory[this.tickHistory.length - 1];
    const oldest = this.tickHistory[0];
    const deltaMs = Math.max(1, latest.timestampMs - oldest.timestampMs);
    const deltaSec = deltaMs / 1000;

    const priceDelta = (latest.price - oldest.price) / oldest.price;
    const velocity = priceDelta / deltaSec;

    let acceleration = 0;
    if (this.tickHistory.length >= 3) {
      const midIdx = Math.floor(this.tickHistory.length / 2);
      const mid = this.tickHistory[midIdx];
      const dt1 = Math.max(1, mid.timestampMs - oldest.timestampMs) / 1000;
      const dt2 = Math.max(1, latest.timestampMs - mid.timestampMs) / 1000;
      const v1 = ((mid.price - oldest.price) / oldest.price) / dt1;
      const v2 = ((latest.price - mid.price) / mid.price) / dt2;
      acceleration = (v2 - v1) / ((dt1 + dt2) / 2);
    }

    const absV = Math.abs(velocity);
    const isToxic = absV >= this.toxicThreshold;
    const severity = Math.min(1.0, absV / (this.toxicThreshold * 3));
    const skewDirection = velocity > 0.0001 ? 'UP' : velocity < -0.0001 ? 'DOWN' : 'NEUTRAL';

    return {
      velocity: Number(velocity.toFixed(6)),
      acceleration: Number(acceleration.toFixed(6)),
      isToxic,
      skewDirection,
      flowSeverity: Number(severity.toFixed(4)),
    };
  }

  public clear(): void {
    this.tickHistory = [];
  }
}
