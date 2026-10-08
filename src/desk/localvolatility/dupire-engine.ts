import { DupireLocalVolConfig, DupirePricingSurface, DupireResult } from './dupire-types';

export class DupireEngine {
  /**
   * Estimates the Local Volatility sigma_L(K, T) using Dupire's equation (1994) via finite differences.
   *
   * Dupire's formula:
   * sigma_L^2(K, T) = ( dC/dT + (r - q)*K*(dC/dK) + q*C ) / ( 0.5 * K^2 * d^2C/dK^2 )
   */
  public static calculateLocalVolatility(
    surface: DupirePricingSurface,
    K: number,
    T: number,
    config: DupireLocalVolConfig
  ): DupireResult {
    const r = config.riskFreeRate;
    const q = config.dividendYield;
    const dK = config.dK ?? K * 0.01; // Default 1% strike bump
    const dT = config.dT ?? Math.max(0.001, T * 0.01); // Default time bump

    // Cap time bump to not overshoot T=0 backwards too much, but Dupire uses forward difference for T
    const C = surface.priceCall(K, T);

    // Forward difference for Time to Maturity (since Dupire expects derivative w.r.t Expiry T)
    const C_T_up = surface.priceCall(K, T + dT);
    const dC_dT = (C_T_up - C) / dT;

    // Central difference for Strike K
    const C_K_up = surface.priceCall(K + dK, T);
    const C_K_down = surface.priceCall(K - dK, T);

    const dC_dK = (C_K_up - C_K_down) / (2 * dK);
    const d2C_dK2 = (C_K_up - 2 * C + C_K_down) / (dK * dK);

    // Numerator: dC/dT + (r - q)*K*(dC/dK) + q*C
    const numerator = dC_dT + (r - q) * K * dC_dK + q * C;
    // Denominator: 0.5 * K^2 * d^2C/dK^2
    const denominator = 0.5 * K * K * d2C_dK2;

    let localVariance = 0.0;
    if (denominator > 1e-12) {
      localVariance = Math.max(0.0, numerator / denominator);
    } // If denominator <= 0, arbitrage violated in the surface (butterfly spread < 0), local variance is capped at 0

    return {
      localVolatility: Math.sqrt(localVariance),
      localVariance,
      firstDerivativeT: dC_dT,
      firstDerivativeK: dC_dK,
      secondDerivativeK: d2C_dK2,
    };
  }
}
