/**
 * SABR Volatility Surface Model
 * Hagan et al. closed-form implied volatility smile expansion.
 *
 * @module desk/rl/sabr-vol-surface-calibrator
 */

import { SabrParameters, VolatilityPoint } from './continuous-rl-vol-types';

export class SabrVolSurfaceCalibrator {
  public calculateImpliedVol(params: SabrParameters, point: VolatilityPoint): number {
    const { alpha, beta, rho, nu } = params;
    const { strikePrice: K, forwardPrice: F, expiryYears: T } = point;

    if (F <= 0 || K <= 0 || T <= 0) {
      return alpha;
    }

    if (Math.abs(F - K) < 1e-6) {
      // At-the-money (ATM) formula
      const term1 = alpha / Math.pow(F, 1 - beta);
      const term2 = 1 + ((Math.pow(1 - beta, 2) / 24) * (alpha * alpha) / Math.pow(F, 2 - 2 * beta)
        + (rho * beta * nu * alpha) / (4 * Math.pow(F, 1 - beta))
        + ((2 - 3 * rho * rho) / 24) * nu * nu) * T;
      return term1 * term2;
    }

    const logFK = Math.log(F / K);
    const fKbeta = Math.pow(F * K, (1 - beta) / 2);
    const z = (nu / alpha) * fKbeta * logFK;
    const chiZ = Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));

    const denominator = fKbeta * (1 + (Math.pow(1 - beta, 2) / 24) * logFK * logFK + (Math.pow(1 - beta, 4) / 1920) * Math.pow(logFK, 4));
    const numerator = alpha * (z / chiZ);

    const timeFactor = 1 + ((Math.pow(1 - beta, 2) / 24) * (alpha * alpha) / (fKbeta * fKbeta)
      + (rho * beta * nu * alpha) / (4 * fKbeta)
      + ((2 - 3 * rho * rho) / 24) * nu * nu) * T;

    const vol = (numerator / denominator) * timeFactor;
    return Math.max(0.001, Number(vol.toFixed(4)));
  }

  public calibrateAtmVol(forwardPrice: number, atmVol: number): SabrParameters {
    return {
      alpha: Math.max(0.05, atmVol * Math.pow(forwardPrice, 0.5)),
      beta: 0.5,
      rho: -0.25,
      nu: 0.40,
    };
  }
}
