/**
 * Scholes-Williams (1977) Non-Synchronous Trading Beta Engine
 *
 * @module desk/scholeswilliams/scholes-williams-engine
 */

import type {
  ReturnSeriesPair,
  ScholesWilliamsBetaResult,
} from './scholes-williams-types';
import { ScholesWilliamsMath } from './scholes-williams-math';

export class ScholesWilliamsEngine {
  public estimate(series: ReturnSeriesPair): ScholesWilliamsBetaResult {
    const { assetReturns: R_i, marketReturns: R_m } = series;
    const { lagBetas, rho_m, var_m, n } = ScholesWilliamsMath.computeLaggedBetas(R_i, R_m);

    const betaSW = ScholesWilliamsMath.computeScholesWilliamsBeta(lagBetas, rho_m);
    const betaOls = lagBetas.betaLag0;
    const biasOlsPct = betaSW !== 0 ? ((betaOls - betaSW) / betaSW) * 100 : 0;

    // Residual variance for standard error
    let sumResSq = 0;
    for (let t = 1; t <= n; t++) {
      const res = R_i[t]! - betaSW * R_m[t]!;
      sumResSq += res * res;
    }
    const residualsVar = sumResSq / Math.max(1, n - 2);
    const standardError = ScholesWilliamsMath.computeStandardError(betaSW, var_m, n, residualsVar, rho_m);
    const tStatisticBeta1 = standardError > 0 ? (betaSW - 1.0) / standardError : 0;

    // Price Discovery Score: (beta_+1 - beta_-1) / (|beta_0| + 1e-4)
    // Positive indicates asset leads market index; negative indicates asset lags market index
    const priceDiscoveryScore =
      (lagBetas.betaLagPlus1 - lagBetas.betaLagMinus1) / (Math.abs(betaOls) + 1e-4);

    return {
      betaScholesWilliams: betaSW,
      betaOls,
      biasOlsPct,
      marketAutocorrelation: rho_m,
      lagBetas,
      standardError,
      tStatisticBeta1,
      priceDiscoveryScore,
      sampleSize: n,
    };
  }
}
