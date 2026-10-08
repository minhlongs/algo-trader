/**
 * Bivariate Hawkes Process Jump Intensity Estimator
 * Models self- and cross-exciting order flow arrivals for microsecond toxicity detection.
 *
 * @module desk/marketmaking/hawkes-intensity-estimator
 */

import {
  HawkesIntensitySnapshot,
  HawkesParameters,
  TradeTick,
} from './marketmaking-types';

export class HawkesIntensityEstimator {
  private readonly params: HawkesParameters;
  private lastUpdateMs: number = 0;
  private buyExcitation: number = 0;
  private sellExcitation: number = 0;

  public constructor(params?: Partial<HawkesParameters>) {
    this.params = {
      baselineMu: params?.baselineMu ?? 1.0, // 1.0 events / sec baseline
      alphaSelf: params?.alphaSelf ?? 0.8, // self-excitation jump
      alphaCross: params?.alphaCross ?? 0.3, // cross-excitation jump
      betaDecay: params?.betaDecay ?? 2.0, // exponential decay rate
    };
  }

  public recordTrade(trade: TradeTick): HawkesIntensitySnapshot {
    this.decayTo(trade.timestampMs);

    if (trade.side === 'BUY') {
      this.buyExcitation += this.params.alphaSelf;
      this.sellExcitation += this.params.alphaCross;
    } else {
      this.sellExcitation += this.params.alphaSelf;
      this.buyExcitation += this.params.alphaCross;
    }

    return this.getIntensitySnapshot(trade.timestampMs);
  }

  public getIntensitySnapshot(currentTimestampMs: number): HawkesIntensitySnapshot {
    this.decayTo(currentTimestampMs);

    const buyIntensity = Number((this.params.baselineMu + this.buyExcitation).toFixed(4));
    const sellIntensity = Number((this.params.baselineMu + this.sellExcitation).toFixed(4));
    const totalIntensity = buyIntensity + sellIntensity;

    const crossExcitationRatio = Number(
      (Math.abs(buyIntensity - sellIntensity) / Math.max(0.001, totalIntensity)).toFixed(4)
    );

    let toxicityLevel: HawkesIntensitySnapshot['toxicityLevel'] = 'LOW';
    const maxIntensity = Math.max(buyIntensity, sellIntensity);

    if (maxIntensity > this.params.baselineMu * 8 || crossExcitationRatio > 0.8) {
      toxicityLevel = 'CRITICAL';
    } else if (maxIntensity > this.params.baselineMu * 4 || crossExcitationRatio > 0.5) {
      toxicityLevel = 'HIGH';
    } else if (maxIntensity > this.params.baselineMu * 2) {
      toxicityLevel = 'MEDIUM';
    }

    return {
      timestampMs: currentTimestampMs,
      buyIntensity,
      sellIntensity,
      crossExcitationRatio,
      toxicityLevel,
    };
  }

  private decayTo(targetTimestampMs: number): void {
    if (this.lastUpdateMs === 0) {
      this.lastUpdateMs = targetTimestampMs;
      return;
    }

    const elapsedSeconds = Math.max(0, (targetTimestampMs - this.lastUpdateMs) / 1000);
    if (elapsedSeconds > 0) {
      const decayFactor = Math.exp(-this.params.betaDecay * elapsedSeconds);
      this.buyExcitation *= decayFactor;
      this.sellExcitation *= decayFactor;
      this.lastUpdateMs = targetTimestampMs;
    }
  }

  public reset(): void {
    this.lastUpdateMs = 0;
    this.buyExcitation = 0;
    this.sellExcitation = 0;
  }
}
