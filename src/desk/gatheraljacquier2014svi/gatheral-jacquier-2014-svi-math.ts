/**
 * Wave 303 — Gatheral & Jacquier (2014): Arbitrage-Free SVI Volatility Surfaces
 * Evaluates raw SVI total variance, Durrleman butterfly density g(k), and Roger Lee wing bounds.
 */
import type {
  GatheralJacquier2014SviConfig,
  GatheralJacquier2014SviResult,
} from './types';

export function computeGatheralJacquier2014Svi(
  cfg: GatheralJacquier2014SviConfig,
): GatheralJacquier2014SviResult {
  const {
    logMoneynessK: k,
    levelA: a,
    slopeB: b,
    correlationRho: rho,
    shiftM: m,
    curvatureSigma: sigma,
  } = cfg;

  if (b < 0 || Math.abs(rho) >= 1 || sigma <= 0) {
    throw new Error('Invalid GatheralJacquier2014SviConfig');
  }

  const d = k - m;
  const rad = Math.sqrt(d * d + sigma * sigma);
  const w = a + b * (rho * d + rad);
  if (w <= 0) {
    throw new Error('Non-positive SVI total variance');
  }

  const wPrime = b * (rho + d / rad);
  const wDoublePrime = (b * sigma * sigma) / (rad * rad * rad);
  const term1 = 1 - (k * wPrime) / (2 * w);
  const term2 = (wPrime * wPrime) / 4 * (1 / w + 0.25);
  const g = term1 * term1 - term2 + 0.5 * wDoublePrime;
  const wingValid = b * (1 + Math.abs(rho)) <= 2.0;

  return {
    totalImpliedVarianceW: w,
    firstDerivativeWPrime: wPrime,
    secondDerivativeWDoublePrime: wDoublePrime,
    durrlemanButterflyDensityG: g,
    rogerLeeWingSlopeBoundValid: wingValid,
    isButterflyArbitrageFree: g >= 0 && wingValid,
  };
}
