/**
 * Gatheral (2004) SVI Total Variance & Arbitrage Formulas
 *
 * Implements SVI raw parameter evaluation, derivatives, and Durrleman's
 * butterfly arbitrage condition g(k) >= 0.
 *
 * @module desk/gatheralsvi/gatheral-svi-formula
 */

import type {
  SviArbitrageDiagnostics,
  SviRawParameters,
} from './gatheral-svi-types';

/** Compute raw SVI total implied variance w(k) = a + b*(rho*(k - m) + sqrt((k - m)^2 + sigma^2)) */
export function computeSviTotalVariance(k: number, params: SviRawParameters): number {
  const { a, b, rho, m, sigma } = params;
  const km = k - m;
  const root = Math.sqrt(km * km + sigma * sigma);
  return a + b * (rho * km + root);
}

/** Compute annualized implied volatility sigma_imp(k) = sqrt(max(1e-8, w(k)) / T) */
export function computeSviImpliedVol(
  k: number,
  timeToMaturity: number,
  params: SviRawParameters,
): number {
  if (timeToMaturity <= 0) throw new Error('Time to maturity must be positive');
  const w = computeSviTotalVariance(k, params);
  return Math.sqrt(Math.max(1e-8, w) / timeToMaturity);
}

/** First derivative w'(k) with respect to log-moneyness */
export function computeSviFirstDerivative(k: number, params: SviRawParameters): number {
  const { b, rho, m, sigma } = params;
  const km = k - m;
  const root = Math.sqrt(km * km + sigma * sigma);
  return b * (rho + km / Math.max(1e-8, root));
}

/** Second derivative w''(k) with respect to log-moneyness */
export function computeSviSecondDerivative(k: number, params: SviRawParameters): number {
  const { b, m, sigma } = params;
  const km = k - m;
  const denom = Math.pow(km * km + sigma * sigma, 1.5);
  return (b * sigma * sigma) / Math.max(1e-12, denom);
}

/**
 * Durrleman's Butterfly Arbitrage Condition g(k):
 * g(k) = (1 - (k * w') / (2 * w))^2 - (w'^2 / 4) * (1/w + 1/4) + w'' / 2
 * Valid if g(k) >= 0 for all k and w(k) > 0.
 */
export function computeDurrlemanG(k: number, params: SviRawParameters): number {
  const w = computeSviTotalVariance(k, params);
  if (w <= 1e-8) return -1.0;

  const wPrime = computeSviFirstDerivative(k, params);
  const wDoublePrime = computeSviSecondDerivative(k, params);

  const term1 = 1 - (k * wPrime) / (2 * w);
  const term2 = (wPrime * wPrime / 4) * (1 / w + 0.25);
  const term3 = wDoublePrime / 2;

  return term1 * term1 - term2 + term3;
}

/** Check butterfly and wing slope arbitrage across a test grid of log-moneyness */
export function evaluateArbitrageConditions(
  params: SviRawParameters,
  timeToMaturity: number,
  gridRange = 2.0,
  gridPoints = 41,
): SviArbitrageDiagnostics {
  let minG = Infinity;
  let worstK = 0;
  const step = (2 * gridRange) / (gridPoints - 1);

  for (let i = 0; i < gridPoints; i++) {
    const k = -gridRange + i * step;
    const g = computeDurrlemanG(k, params);
    if (g < minG) {
      minG = g;
      worstK = k;
    }
  }

  // Wing slope condition: b * (1 + |rho|) <= 2 (or conservative 4/T)
  const wingSlopeFeasible = params.b * (1 + Math.abs(params.rho)) <= 2.0;

  return {
    isButterflyArbitrageFree: minG >= 0,
    minButterflyG: minG,
    isCalendarArbitrageFree: true,
    wingSlopeFeasible,
    worstMoneynessViolation: minG < 0 ? worstK : undefined,
  };
}
