/**
 * Kalman Filter Core
 *
 * Mathematical core: 1D scalar Kalman filter and residual Z-score evaluator.
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';
import { calcStdDev } from './strategy-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface KalmanFilterConfig extends BaseStrategyConfig {
  /** Process noise variance (Q) — how much the true price can change per step */
  processNoise: number;
  /** Measurement noise variance (R) — how noisy the observed price is */
  measurementNoise: number;
  /** Number of standard deviations of residual to trigger entry */
  entryStdDev: number;
  /** Residual must also exceed this absolute value (in price units) */
  minResidual: number;
  /** Window for residual standard deviation tracking */
  residualWindow: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size */
  baseSizeUsdc: number;
  /** Markets to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: KalmanFilterConfig = {
  processNoise: 0.001,
  measurementNoise: 0.01,
  entryStdDev: 2.0,
  minResidual: 0.02,
  residualWindow: 20,
  minVolume: 1000,
  baseSizeUsdc: 25,
  scanLimit: 15,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 6 * 60_000,
  maxPositions: 2,
  cooldownMs: 90_000,
  positionSize: '25',
};

// ── Kalman Filter ───────────────────────────────────────────────────────────

/**
 * Simple 1D Kalman filter for scalar observations.
 *
 * State: estimated true price
 * Observation: market mid-price
 * Model: price follows a random walk (constant position model with process noise)
 */
export class KalmanFilter1D {
  private state: number;
  private covariance: number;

  constructor(
    private readonly processNoise: number,
    private readonly measurementNoise: number,
    initialState = 0.5,
    initialCovariance = 0.1,
  ) {
    this.state = initialState;
    this.covariance = initialCovariance;
  }

  /** Update with a new observation and return the filtered estimate. */
  update(observation: number): number {
    // Predict step (constant position model with process noise)
    this.covariance += this.processNoise;

    // Update step (Kalman gain)
    const gain = this.covariance / (this.covariance + this.measurementNoise);
    this.state += gain * (observation - this.state);
    this.covariance = (1 - gain) * this.covariance;

    return this.state;
  }

  getState(): number { return this.state; }
  getCovariance(): number { return this.covariance; }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Compute Z-score of current residual relative to its history.
 */
export function calcResidualZScore(residual: number, history: number[]): number {
  if (history.length < 3) return 0;
  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const std = calcStdDev(history);
  if (std <= 0) return 0;
  return Math.abs(residual - mean) / std;
}
