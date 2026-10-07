/**
 * Lead-Lag Alpha Predictor Engine
 *
 * Implements Hayashi-Yoshida asynchronous cross-correlation and Hawkes jump
 * intensity modeling to forecast high-frequency lead-lag alpha across venues.
 *
 * @module desk/signal/lead-lag-alpha-predictor
 */

import type {
  LeadLagAlphaSignal,
  LeadLagPredictorConfig,
  PriceTick,
} from './lead-lag-alpha-types';

export class LeadLagAlphaPredictor {
  private readonly config: LeadLagPredictorConfig;
  private readonly ticksByVenueAndSymbol: Map<string, PriceTick[]> = new Map();

  public constructor(config?: Partial<LeadLagPredictorConfig>) {
    this.config = {
      halflifeMs: config?.halflifeMs ?? 10_000,
      minObservations: config?.minObservations ?? 5,
      decayBeta: config?.decayBeta ?? 0.001,
      minCorrelationThreshold: config?.minCorrelationThreshold ?? 0.3,
    };
  }

  public recordTick(tick: PriceTick): void {
    const key = `${tick.venue}:${tick.symbol}`;
    const ticks = this.ticksByVenueAndSymbol.get(key) ?? [];
    ticks.push(tick);

    // Prune ticks outside retention window
    const cutoff = tick.timestampMs - this.config.halflifeMs * 3;
    const pruned = ticks.filter((t) => t.timestampMs >= cutoff);
    this.ticksByVenueAndSymbol.set(key, pruned);
  }

  public computeHayashiYoshidaCorrelation(
    leadVenue: string,
    lagVenue: string,
    symbol: string
  ): number {
    const leadTicks = this.ticksByVenueAndSymbol.get(`${leadVenue}:${symbol}`) ?? [];
    const lagTicks = this.ticksByVenueAndSymbol.get(`${lagVenue}:${symbol}`) ?? [];

    if (
      leadTicks.length < this.config.minObservations ||
      lagTicks.length < this.config.minObservations
    ) {
      return 0;
    }

    let crossProductSum = 0;
    let leadVarSum = 0;
    let lagVarSum = 0;

    for (let i = 1; i < leadTicks.length; i++) {
      const leadPrev = leadTicks[i - 1]!;
      const leadCurr = leadTicks[i]!;
      const leadReturn = (leadCurr.price - leadPrev.price) / leadPrev.price;
      leadVarSum += leadReturn * leadReturn;

      for (let j = 1; j < lagTicks.length; j++) {
        const lagPrev = lagTicks[j - 1]!;
        const lagCurr = lagTicks[j]!;

        const intervalsOverlap =
          Math.max(leadPrev.timestampMs, lagPrev.timestampMs) <
          Math.min(leadCurr.timestampMs, lagCurr.timestampMs);

        if (intervalsOverlap) {
          const lagReturn = (lagCurr.price - lagPrev.price) / lagPrev.price;
          crossProductSum += leadReturn * lagReturn;
        }
      }
    }

    for (let j = 1; j < lagTicks.length; j++) {
      const lagPrev = lagTicks[j - 1]!;
      const lagCurr = lagTicks[j]!;
      const lagReturn = (lagCurr.price - lagPrev.price) / lagPrev.price;
      lagVarSum += lagReturn * lagReturn;
    }

    const denominator = Math.sqrt(leadVarSum * lagVarSum);
    if (denominator <= 0) return 0;

    const rawCorr = crossProductSum / denominator;
    return Math.max(-1, Math.min(1, rawCorr));
  }

  public calculateHawkesIntensity(venue: string, symbol: string, nowMs: number): number {
    const ticks = this.ticksByVenueAndSymbol.get(`${venue}:${symbol}`) ?? [];
    if (ticks.length === 0) return 0.1;

    const baseIntensity = 0.1;
    let excitedIntensity = 0;

    for (const tick of ticks) {
      const deltaT = nowMs - tick.timestampMs;
      if (deltaT >= 0) {
        excitedIntensity += Math.exp(-this.config.decayBeta * deltaT);
      }
    }

    return baseIntensity + excitedIntensity * 0.05;
  }

  public predictAlpha(
    leadVenue: string,
    lagVenue: string,
    symbol: string,
    nowMs: number
  ): LeadLagAlphaSignal {
    const leadTicks = this.ticksByVenueAndSymbol.get(`${leadVenue}:${symbol}`) ?? [];
    const lagTicks = this.ticksByVenueAndSymbol.get(`${lagVenue}:${symbol}`) ?? [];

    const correlation = this.computeHayashiYoshidaCorrelation(leadVenue, lagVenue, symbol);
    const intensity = this.calculateHawkesIntensity(leadVenue, symbol, nowMs);

    let driftBps = 0;
    let estimatedLagMs = 50;

    if (leadTicks.length >= 2 && lagTicks.length >= 2) {
      const leadLast = leadTicks[leadTicks.length - 1]!;
      const leadPenultimate = leadTicks[leadTicks.length - 2]!;
      const leadReturnBps =
        ((leadLast.price - leadPenultimate.price) / leadPenultimate.price) * 10_000;

      const lagLast = lagTicks[lagTicks.length - 1]!;
      const lagPenultimate = lagTicks[lagTicks.length - 2]!;
      const lagReturnBps =
        ((lagLast.price - lagPenultimate.price) / lagPenultimate.price) * 10_000;

      // Residual unabsorbed momentum drift
      driftBps = correlation * (leadReturnBps - lagReturnBps * 0.5);
      estimatedLagMs = Math.max(10, Math.abs(lagLast.timestampMs - leadLast.timestampMs));
    }

    const confidence = Math.min(1.0, Math.abs(correlation) * (intensity > 0.5 ? 1.0 : 0.7));

    return {
      leadVenue,
      lagVenue,
      symbol,
      estimatedLagMs,
      crossCorrelation: Math.round(correlation * 1000) / 1000,
      expectedPriceDriftBps: Math.round(driftBps * 10) / 10,
      jumpIntensity: Math.round(intensity * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      timestampMs: nowMs,
    };
  }
}
