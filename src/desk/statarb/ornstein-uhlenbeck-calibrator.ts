/**
 * Continuous Ornstein-Uhlenbeck Maximum Likelihood Calibrator
 * Calibrates mean reversion speed theta, equilibrium mean mu, and volatility sigma.
 *
 * @module desk/statarb/ornstein-uhlenbeck-calibrator
 */

import { OuParameters } from './statarb-types';

export class OrnsteinUhlenbeckCalibrator {
  /**
   * Calibrates OU process parameters using exact discrete AR(1) OLS mapping.
   * X_{t} = a + b * X_{t-1} + eps
   * b = exp(-theta * dt) -> theta = -ln(b) / dt
   * mu = a / (1 - b)
   * sigma = sigma_eps * sqrt(2 * theta / (1 - b^2))
   */
  public calibrate(spread: number[], dt = 1.0): OuParameters {
    const N = spread.length;
    if (N < 5) {
      throw new Error('Spread series must contain at least 5 observations');
    }

    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;

    const M = N - 1;
    for (let i = 0; i < M; i++) {
      const x = spread[i]!;
      const y = spread[i + 1]!;
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumXY += x * y;
    }

    // OLS regression: y = a + b * x
    const denom = M * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) {
      throw new Error('Degenerate spread series with zero variance');
    }

    const b = (M * sumXY - sumX * sumY) / denom;
    const a = (sumY - b * sumX) / M;

    // Check for mean reversion (0 < b < 1)
    const effectiveB = Math.max(0.0001, Math.min(0.9999, b));
    const theta = -Math.log(effectiveB) / dt;
    const mu = a / (1 - effectiveB);

    // Residual sum of squares
    let sse = 0;
    for (let i = 0; i < M; i++) {
      const pred = a + effectiveB * spread[i]!;
      const err = spread[i + 1]! - pred;
      sse += err * err;
    }
    const varEps = sse / M;
    const sigma = Math.sqrt((varEps * 2 * theta) / Math.max(1e-6, 1 - effectiveB * effectiveB));
    const halfLife = Math.log(2) / Math.max(1e-6, theta);
    const equilibriumVariance = (sigma * sigma) / (2 * theta);

    return {
      theta: Number(theta.toFixed(6)),
      mu: Number(mu.toFixed(6)),
      sigma: Number(sigma.toFixed(6)),
      halfLifePeriods: Number(halfLife.toFixed(2)),
      equilibriumVariance: Number(equilibriumVariance.toFixed(6)),
    };
  }
}
