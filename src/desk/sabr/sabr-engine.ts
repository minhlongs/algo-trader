import { SabrParams, SabrResult } from './sabr-types';

export class SabrEngine {
  /**
   * Calculates Black implied volatility using the SABR asymptotic formula by Hagan et al. (2002).
   */
  public static calculateImpliedVolatility(params: SabrParams): SabrResult {
    const f = params.forward;
    const K = params.strike;
    const T = params.timeToExpiry;
    const alpha = params.alpha;
    const beta = params.beta;
    const rho = params.rho;
    const nu = params.nu;

    // Handle edge cases
    if (f <= 0 || K <= 0 || T <= 0) {
      return { impliedVolatility: 0, z: 0, xz: 0, isValid: false };
    }

    if (f === K) {
      // ATM approximation
      const f_pow = Math.pow(f, 1.0 - beta);
      const term1_atm = alpha / f_pow;
      const term2_atm = (((1.0 - beta) * (1.0 - beta) * alpha * alpha) / (24.0 * f_pow * f_pow)) +
                        ((rho * beta * nu * alpha) / (4.0 * f_pow)) +
                        (((2.0 - 3.0 * rho * rho) * nu * nu) / 24.0);
      
      const volAtm = term1_atm * (1.0 + term2_atm * T);
      return { impliedVolatility: Math.max(0, volAtm), z: 0, xz: 0, isValid: true };
    }

    const logFk = Math.log(f / K);
    const fK = f * K;
    const fKPow = Math.pow(fK, (1.0 - beta) / 2.0);

    const z = (nu / alpha) * fKPow * logFk;

    // x(z) calculation
    let xz = 0.0;
    if (Math.abs(z) > 1e-7) {
      const sqrtTerm = Math.sqrt(1.0 - 2.0 * rho * z + z * z);
      xz = Math.log((sqrtTerm + z - rho) / (1.0 - rho));
    } else {
      xz = z; // L'Hopital limit
    }

    // Denominator expansion
    const oneMinusBeta = 1.0 - beta;
    const oneMinusBetaSq = oneMinusBeta * oneMinusBeta;
    const logFkSq = logFk * logFk;
    const logFk4 = logFkSq * logFkSq;

    const denomTerm = 1.0 + (oneMinusBetaSq / 24.0) * logFkSq + (oneMinusBetaSq * oneMinusBetaSq / 1920.0) * logFk4;
    const fraction1 = alpha / (fKPow * denomTerm);

    const fraction2 = (Math.abs(z) > 1e-7) ? (z / xz) : 1.0;

    // Correction expansion
    const term3_1 = (oneMinusBetaSq * alpha * alpha) / (24.0 * fKPow * fKPow);
    const term3_2 = (rho * beta * nu * alpha) / (4.0 * fKPow);
    const term3_3 = ((2.0 - 3.0 * rho * rho) * nu * nu) / 24.0;
    
    // Final assembling
    const vol = fraction1 * fraction2 * (1.0 + (term3_1 + term3_2 + term3_3) * T);

    return {
      impliedVolatility: Math.max(0, vol),
      z,
      xz,
      isValid: true
    };
  }
}
