/**
 * Prediction Market Statistical Arbitrage Engine
 *
 * Implements linear cointegration modeling (OLS hedge ratio), Ornstein-Uhlenbeck
 * mean-reversion half-life estimation, and rolling z-score trading signals.
 *
 * @module desk/arbitrage/pm-statarb-engine
 */

import type {
  PriceObservation,
  StatArbConfig,
  SpreadModel,
  StatArbSignal,
  StatArbSignalDirection,
} from './pm-statarb-types';

export class PmStatArbEngine {
  private readonly minObservations: number;
  private readonly entryZScore: number;
  private readonly exitZScore: number;
  private readonly stopLossZScore: number;
  private readonly maxHalfLife: number;

  constructor(config: StatArbConfig = {}) {
    this.minObservations = config.minObservations ?? 20;
    this.entryZScore = config.entryZScore ?? 2.0;
    this.exitZScore = config.exitZScore ?? 0.5;
    this.stopLossZScore = config.stopLossZScore ?? 3.5;
    this.maxHalfLife = config.maxHalfLifePeriods ?? 50;
  }

  public calibrateModel(history: readonly PriceObservation[]): SpreadModel | null {
    if (history.length < this.minObservations) return null;

    const n = history.length;
    let sumA = 0;
    let sumB = 0;
    for (const h of history) {
      sumA += h.priceA;
      sumB += h.priceB;
    }
    const meanA = sumA / n;
    const meanB = sumB / n;

    let covAB = 0;
    let varB = 0;
    for (const h of history) {
      const devA = h.priceA - meanA;
      const devB = h.priceB - meanB;
      covAB += devA * devB;
      varB += devB * devB;
    }

    if (varB <= 1e-12) return null;
    const hedgeRatio = covAB / varB;
    const intercept = meanA - hedgeRatio * meanB;

    const residuals = history.map((h) => h.priceA - (intercept + hedgeRatio * h.priceB));
    const meanSpread = residuals.reduce((s, r) => s + r, 0) / n;
    const spreadVar = residuals.reduce((s, r) => s + (r - meanSpread) ** 2, 0) / (n - 1);
    const spreadStdDev = Math.sqrt(Math.max(1e-12, spreadVar));

    const halfLife = this.estimateHalfLife(residuals);
    const isCointegrated = halfLife > 0 && halfLife <= this.maxHalfLife;

    return {
      hedgeRatio,
      intercept,
      meanSpread,
      spreadStdDev,
      halfLifePeriods: halfLife,
      isCointegrated,
    };
  }

  public generateSignal(params: {
    pairId: string;
    latestPriceA: number;
    latestPriceB: number;
    model: SpreadModel;
    timestamp?: number;
  }): StatArbSignal {
    const { pairId, latestPriceA, latestPriceB, model } = params;
    const timestamp = params.timestamp ?? Date.now();

    const currentResidual =
      latestPriceA - (model.intercept + model.hedgeRatio * latestPriceB);
    const zScore = (currentResidual - model.meanSpread) / model.spreadStdDev;

    let direction: StatArbSignalDirection = 'NO_SIGNAL';
    let confidence = 0;

    if (!model.isCointegrated) {
      return { pairId, timestamp, direction, currentSpread: currentResidual, zScore, hedgeRatio: model.hedgeRatio, confidence: 0 };
    }

    if (Math.abs(zScore) >= this.stopLossZScore) {
      direction = 'CLOSE';
      confidence = 1.0;
    } else if (zScore <= -this.entryZScore) {
      direction = 'LONG_SPREAD';
      confidence = Math.min(1.0, Math.abs(zScore) / this.entryZScore);
    } else if (zScore >= this.entryZScore) {
      direction = 'SHORT_SPREAD';
      confidence = Math.min(1.0, Math.abs(zScore) / this.entryZScore);
    } else if (Math.abs(zScore) <= this.exitZScore) {
      direction = 'CLOSE';
      confidence = 0.8;
    }

    return {
      pairId,
      timestamp,
      direction,
      currentSpread: currentResidual,
      zScore,
      hedgeRatio: model.hedgeRatio,
      confidence,
    };
  }

  private estimateHalfLife(residuals: number[]): number {
    if (residuals.length < 3) return Infinity;
    const deltas: number[] = [];
    const lags: number[] = [];

    for (let i = 1; i < residuals.length; i++) {
      deltas.push(residuals[i] - residuals[i - 1]);
      lags.push(residuals[i - 1]);
    }

    const n = deltas.length;
    let sumLag = 0;
    let sumDelta = 0;
    for (let i = 0; i < n; i++) {
      sumLag += lags[i];
      sumDelta += deltas[i];
    }
    const meanLag = sumLag / n;
    const meanDelta = sumDelta / n;

    let cov = 0;
    let varLag = 0;
    for (let i = 0; i < n; i++) {
      cov += (lags[i] - meanLag) * (deltas[i] - meanDelta);
      varLag += (lags[i] - meanLag) ** 2;
    }

    if (varLag <= 1e-12) return Infinity;
    const lambda = cov / varLag;

    if (lambda >= 0) return Infinity;
    return -Math.log(2) / lambda;
  }
}
