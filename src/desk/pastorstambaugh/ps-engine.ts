import {
  PsStockObservation,
  PsStockReversalResult,
  PsInnovationResult,
  PsLiquidityBetaResult,
} from './ps-types.js';
import { PsMath } from './ps-math.js';

export class PsEngine {
  /**
   * Estimates stock-level reversal gamma_i via Pástor-Stambaugh regression:
   * r^e_{i, d+1} = theta_0 + theta_1 * r_{i, d} + gamma_i * sign(r^e_{i, d}) * v_{i, d} + eps_{i, d+1}
   */
  public static estimateStockGamma(observations: PsStockObservation[]): PsStockReversalResult {
    if (observations.length < 15) {
      throw new Error('Minimum 15 daily observations required for Pástor-Stambaugh regression');
    }

    const y: number[] = observations.map(o => o.returnNext - o.marketReturnNext); // excess return r^e_{i, d+1}
    const X: number[][] = observations.map(o => [
      1.0, // Intercept theta_0
      o.returnCurrent, // Lagged return theta_1
      o.signedVolume, // Signed volume gamma_i
    ]);

    const reg = PsMath.ols(y, X);
    const gamma = reg.beta[2];
    const tStat = reg.tStats[2];

    return {
      gamma,
      tStat,
      rSquared: reg.rSquared,
      sampleSize: observations.length,
    };
  }

  /**
   * Filters aggregate market liquidity series via AR(1) to extract systematic innovations:
   * L_t = c + rho * L_{t-1} + u_t
   */
  public static extractInnovations(liquiditySeries: number[]): PsInnovationResult {
    const T = liquiditySeries.length;
    if (T < 10) throw new Error('At least 10 monthly observations required for AR(1) innovation filtering');

    const y: number[] = [];
    const X: number[][] = [];

    for (let t = 1; t < T; t++) {
      y.push(liquiditySeries[t]);
      X.push([1.0, liquiditySeries[t - 1]]);
    }

    const reg = PsMath.ols(y, X);
    const rho = reg.beta[1];

    const innovations: number[] = [];
    let sumSq = 0;
    for (let t = 1; t < T; t++) {
      const pred = reg.beta[0] + rho * liquiditySeries[t - 1];
      const u = liquiditySeries[t] - pred;
      innovations.push(u);
      sumSq += u * u;
    }

    const variance = sumSq / (innovations.length - 2);

    return {
      innovations,
      persistence: rho,
      variance,
    };
  }

  /**
   * Estimates asset sensitivity (liquidity beta) to aggregate liquidity shocks:
   * r_{i, t} - r_{f, t} = alpha_i + beta^m_i * (r_{m, t} - r_{f, t}) + beta^L_i * u_t + e_{i, t}
   */
  public static estimateLiquidityBeta(
    excessReturns: number[],
    marketExcessReturns: number[],
    liquidityInnovations: number[]
  ): PsLiquidityBetaResult {
    const N = excessReturns.length;
    if (N !== marketExcessReturns.length || N !== liquidityInnovations.length) {
      throw new Error('Series lengths must match');
    }
    if (N < 10) throw new Error('At least 10 observations required for factor regression');

    const y = excessReturns;
    const X = [];
    for (let i = 0; i < N; i++) {
      X.push([1.0, marketExcessReturns[i], liquidityInnovations[i]]);
    }

    const reg = PsMath.ols(y, X);

    return {
      alpha: reg.beta[0],
      marketBeta: reg.beta[1],
      liquidityBeta: reg.beta[2],
      rSquared: reg.rSquared,
    };
  }
}
