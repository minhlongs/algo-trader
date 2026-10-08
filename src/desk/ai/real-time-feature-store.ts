/**
 * Real-Time Streaming Feature Store
 * Standardizes raw order book and trade events into zero-mean unit-variance vectors online.
 *
 * @module desk/ai/real-time-feature-store
 */

import { MarketFeatureVector } from './ai-types';

export class RealTimeFeatureStore {
  private readonly history: MarketFeatureVector[] = [];
  private readonly maxCapacity: number;
  private runningSumReturn = 0;
  private runningSumSqReturn = 0;
  private count = 0;

  public constructor(capacity = 5000) {
    this.maxCapacity = capacity;
  }

  public recordObservation(
    timestampMs: number,
    symbol: string,
    rawReturn: number,
    spreadBps: number,
    orderBookImbalance: number,
    volumeUsd: number
  ): MarketFeatureVector {
    this.count += 1;
    this.runningSumReturn += rawReturn;
    this.runningSumSqReturn += rawReturn * rawReturn;

    const mean = this.runningSumReturn / this.count;
    const variance = Math.max(1e-8, this.runningSumSqReturn / this.count - mean * mean);
    const stdDev = Math.sqrt(variance);

    const returnZScore = (rawReturn - mean) / stdDev;
    const normalizedSpread = Math.min(10, spreadBps / 5.0);
    const volumeIntensity = Math.log1p(Math.max(0, volumeUsd)) / 10;
    const realizedVolAnnualized = stdDev * Math.sqrt(252 * 1440);

    const vector: MarketFeatureVector = {
      timestampMs,
      symbol,
      returnZScore: Number(returnZScore.toFixed(3)),
      normalizedSpread: Number(normalizedSpread.toFixed(3)),
      orderBookImbalance: Number(orderBookImbalance.toFixed(3)),
      volumeIntensity: Number(volumeIntensity.toFixed(3)),
      realizedVolAnnualized: Number(realizedVolAnnualized.toFixed(3)),
    };

    if (this.history.length >= this.maxCapacity) {
      this.history.shift();
    }
    this.history.push(vector);

    return vector;
  }

  public getLatestFeature(symbol: string): MarketFeatureVector | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i]?.symbol === symbol) {
        return this.history[i];
      }
    }
    return undefined;
  }
}
