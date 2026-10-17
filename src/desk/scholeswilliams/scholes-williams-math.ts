/**
 * Scholes-Williams (1977) Non-Synchronous Trading Beta Mathematics
 *
 * @module desk/scholeswilliams/scholes-williams-math
 */

import type { LagBetaEstimates } from './scholes-williams-types';

export class ScholesWilliamsMath {
  public static computeLaggedBetas(
    R_i: number[],
    R_m: number[],
  ): { lagBetas: LagBetaEstimates; rho_m: number; var_m: number; n: number } {
    const nTotal = Math.min(R_i.length, R_m.length);
    if (nTotal < 5) throw new Error(`Insufficient observations for Scholes-Williams: got ${nTotal}, minimum 5`);

    // Aligned vectors for lags -1, 0, +1
    // For t = 1 to nTotal - 2:
    // Ri_t = R_i[t]
    // Rm_t = R_m[t]
    // Rm_minus1 = R_m[t - 1]
    // Rm_plus1 = R_m[t + 1]
    const n = nTotal - 2;
    let sumRm = 0, sumRmSq = 0;
    for (let t = 1; t <= n; t++) {
      sumRm += R_m[t]!;
      sumRmSq += R_m[t]! * R_m[t]!;
    }
    const meanRm = sumRm / n;
    const var_m = sumRmSq / n - meanRm * meanRm;
    if (var_m <= 1e-12) throw new Error('Market return variance is virtually zero');

    // Covariances
    let sumRi = 0;
    let sumCov0 = 0;
    let sumCovMinus1 = 0;
    let sumCovPlus1 = 0;
    let sumRmAuto = 0;

    for (let t = 1; t <= n; t++) {
      sumRi += R_i[t]!;
    }
    const meanRi = sumRi / n;

    for (let t = 1; t <= n; t++) {
      const dRi = R_i[t]! - meanRi;
      const dRm = R_m[t]! - meanRm;
      const dRmMinus1 = R_m[t - 1]! - meanRm;
      const dRmPlus1 = R_m[t + 1]! - meanRm;

      sumCov0 += dRi * dRm;
      sumCovMinus1 += dRi * dRmMinus1;
      sumCovPlus1 += dRi * dRmPlus1;
      sumRmAuto += dRm * dRmMinus1;
    }

    const betaLag0 = sumCov0 / (n * var_m);
    const betaLagMinus1 = sumCovMinus1 / (n * var_m);
    const betaLagPlus1 = sumCovPlus1 / (n * var_m);
    const rho_m = Math.max(-0.49, Math.min(0.49, sumRmAuto / (n * var_m)));

    return {
      lagBetas: { betaLagMinus1, betaLag0, betaLagPlus1 },
      rho_m,
      var_m,
      n,
    };
  }

  public static computeScholesWilliamsBeta(lagBetas: LagBetaEstimates, rho_m: number): number {
    const numerator = lagBetas.betaLagMinus1 + lagBetas.betaLag0 + lagBetas.betaLagPlus1;
    const denominator = 1 + 2 * rho_m;
    if (Math.abs(denominator) < 1e-6) return numerator;
    return numerator / denominator;
  }

  public static computeStandardError(
    betaSW: number,
    var_m: number,
    n: number,
    residualsVar: number,
    rho_m: number,
  ): number {
    const denom = (1 + 2 * rho_m) * (1 + 2 * rho_m) * n * var_m;
    if (denom <= 1e-12) return 0.05;
    const variance = (3 * residualsVar) / denom;
    return Math.sqrt(Math.max(1e-8, variance));
  }
}
