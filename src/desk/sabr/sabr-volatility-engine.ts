import { SabrEvaluationRequest, SabrImpliedVolResult, SabrParameters } from './sabr-types';

export class SabrVolatilityEngine {
  public calculateImpliedVolatility(request: SabrEvaluationRequest): SabrImpliedVolResult {
    const { forwardPrice: F, strikePrice: K, timeToExpiryYears: T, parameters } = request;
    const { alpha, beta, rho, nu } = parameters;

    if (F <= 0 || K <= 0) {
      throw new Error('Forward and strike prices must be positive');
    }
    if (T <= 0) {
      throw new Error('Time to expiry must be positive');
    }
    if (alpha <= 0) {
      throw new Error('Alpha must be positive');
    }
    if (nu < 0) {
      throw new Error('Nu (vol-of-vol) must be non-negative');
    }
    if (rho < -1.0 || rho > 1.0) {
      throw new Error('Rho correlation must be in [-1, 1]');
    }
    if (beta < 0 || beta > 1.0) {
      throw new Error('Beta must be in [0, 1]');
    }

    const isAtm = Math.abs(F - K) / F < 1e-5;

    if (isAtm) {
      const fMid = F;
      const term1 = alpha / Math.pow(fMid, 1.0 - beta);
      const bMinus1 = 1.0 - beta;
      const factor1 = ((bMinus1 * bMinus1) / 24.0) * (alpha * alpha) / Math.pow(fMid, 2.0 - 2.0 * beta);
      const factor2 = 0.25 * (rho * beta * nu * alpha) / Math.pow(fMid, 1.0 - beta);
      const factor3 = ((2.0 - 3.0 * rho * rho) / 24.0) * (nu * nu);
      const expansion = 1.0 + (factor1 + factor2 + factor3) * T;
      const sigmaAtm = term1 * expansion;

      return {
        forwardPrice: F,
        strikePrice: K,
        timeToExpiryYears: T,
        impliedVolPct: Number((sigmaAtm * 100.0).toFixed(4)),
        isAtm: true,
      };
    }

    const logFK = Math.log(F / K);
    const fkProduct = F * K;
    const fkSqrt = Math.sqrt(fkProduct);
    const oneMinusBeta = 1.0 - beta;

    const denomZ = alpha * Math.pow(fkSqrt, oneMinusBeta);
    const z = (nu / alpha) * Math.pow(fkSqrt, oneMinusBeta) * logFK;

    const sqrtTerm = Math.sqrt(1.0 - 2.0 * rho * z + z * z);
    const xzNum = sqrtTerm + z - rho;
    const xzDenom = 1.0 - rho;
    const xz = Math.log(Math.max(1e-12, xzNum / xzDenom));

    const zOverXz = Math.abs(z) < 1e-5 ? 1.0 : z / xz;

    const bMinus1Squared = oneMinusBeta * oneMinusBeta;
    const bMinus1Fourth = bMinus1Squared * bMinus1Squared;

    const termDenom1 = 1.0 + (bMinus1Squared / 24.0) * (logFK * logFK) + (bMinus1Fourth / 1920.0) * Math.pow(logFK, 4.0);
    const mainVolPre = (alpha / (Math.pow(fkSqrt, oneMinusBeta) * termDenom1)) * zOverXz;

    const factor1 = (bMinus1Squared / 24.0) * (alpha * alpha) / Math.pow(fkSqrt, 2.0 * oneMinusBeta);
    const factor2 = 0.25 * (rho * beta * nu * alpha) / Math.pow(fkSqrt, oneMinusBeta);
    const factor3 = ((2.0 - 3.0 * rho * rho) / 24.0) * (nu * nu);
    const expansion = 1.0 + (factor1 + factor2 + factor3) * T;

    const sigma = mainVolPre * expansion;

    return {
      forwardPrice: F,
      strikePrice: K,
      timeToExpiryYears: T,
      impliedVolPct: Number((sigma * 100.0).toFixed(4)),
      isAtm: false,
    };
  }
}
