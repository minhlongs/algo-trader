/**
 * Mathematical Statistics Utility
 *
 * Implements core statistical functions for quantitative validation and overfitting filters:
 * - Standard normal CDF approximation (Abramowitz & Stegun)
 * - Inverse normal CDF / probit function (Acklam algorithm, error < 1.15e-9)
 * - Sample skewness (Fisher-Pearson coefficient)
 * - Sample kurtosis (Pearson kurtosis, normal = 3)
 * - Expected maximum Sharpe under N trials via Extreme Value Theory (Bailey & López de Prado)
 * - Deflated Sharpe Ratio (DSR) correcting for multiple testing and selection bias
 */

export const EULER_MASCHERONI = 0.57721566490153286;

/**
 * Standard Normal Cumulative Distribution Function (Abramowitz & Stegun 7.1.26).
 * Maximum absolute error < 1.5e-7.
 */
export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1.0 - poly * Math.exp(-absX * absX);

  return Math.min(1, Math.max(0, 0.5 * (1.0 + sign * y)));
}

// Acklam algorithm coefficients for rational approximation
const A_COEFFS = [
  -3.969683028665376e1,  2.209460984245205e2,
  -2.759285104469687e2,  1.38357751867269e2,
  -3.066479806614716e1,  2.506628277459239e0,
];
const B_COEFFS = [
  -5.447609879822406e1,  1.615858368580409e2,
  -1.556989798598866e2,  6.680131188771972e1,
  -1.328068155288572e1,
];
const C_COEFFS = [
  -7.784894002430293e-3, -3.223964580411365e-1,
  -2.400758277161838e0,  -2.549732539343734e0,
   4.374664141464968e0,   2.938163982698783e0,
];
const D_COEFFS = [
   7.784695709041462e-3,  3.224671290700398e-1,
   2.445134137142996e0,   3.754408661907416e0,
];

/**
 * Inverse Standard Normal CDF (Acklam Algorithm).
 * Accurate to absolute error < 1.15e-9 across 0 < p < 1.
 */
export function inverseNormalCdf(p: number): number {
  if (Number.isNaN(p)) return NaN;
  if (p <= 0) return p === 0 ? -Infinity : NaN;
  if (p >= 1) return p === 1 ? Infinity : NaN;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    const num = ((((C_COEFFS[0] * q + C_COEFFS[1]) * q + C_COEFFS[2]) * q + C_COEFFS[3]) * q + C_COEFFS[4]) * q + C_COEFFS[5];
    const den = (((D_COEFFS[0] * q + D_COEFFS[1]) * q + D_COEFFS[2]) * q + D_COEFFS[3]) * q + 1;
    return num / den;
  }

  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    const num = (((((A_COEFFS[0] * r + A_COEFFS[1]) * r + A_COEFFS[2]) * r + A_COEFFS[3]) * r + A_COEFFS[4]) * r + A_COEFFS[5]) * q;
    const den = ((((B_COEFFS[0] * r + B_COEFFS[1]) * r + B_COEFFS[2]) * r + B_COEFFS[3]) * r + B_COEFFS[4]) * r + 1;
    return num / den;
  }

  const q = Math.sqrt(-2 * Math.log(1 - p));
  const num = ((((C_COEFFS[0] * q + C_COEFFS[1]) * q + C_COEFFS[2]) * q + C_COEFFS[3]) * q + C_COEFFS[4]) * q + C_COEFFS[5];
  const den = (((D_COEFFS[0] * q + D_COEFFS[1]) * q + D_COEFFS[2]) * q + D_COEFFS[3]) * q + 1;
  return -num / den;
}

/**
 * Fisher-Pearson coefficient of sample skewness.
 */
export function computeSkewness(data: readonly number[]): number {
  const n = data.length;
  if (n < 3) return 0;
  const meanVal = data.reduce((sum, v) => sum + v, 0) / n;
  let m2 = 0;
  let m3 = 0;
  for (let i = 0; i < n; i++) {
    const diff = data[i] - meanVal;
    m2 += diff * diff;
    m3 += diff * diff * diff;
  }
  const variance = m2 / n;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (m3 / n) / (stdDev * stdDev * stdDev);
}

/**
 * Pearson kurtosis (uncentered, normal distribution = 3).
 */
export function computeKurtosis(data: readonly number[]): number {
  const n = data.length;
  if (n < 4) return 3;
  const meanVal = data.reduce((sum, v) => sum + v, 0) / n;
  let m2 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const diff = data[i] - meanVal;
    m2 += diff * diff;
    m4 += diff * diff * diff * diff;
  }
  const variance = m2 / n;
  if (variance === 0) return 3;
  return (m4 / n) / (variance * variance);
}

/**
 * Expected maximum Sharpe ratio under N trials via Extreme Value Theory (Bailey & López de Prado 2014).
 * sr* = sqrt(V[sr]) * [ (1 - gamma_E) Phi^-1(1 - 1/N) + gamma_E Phi^-1(1 - 1/(N e)) ]
 * For N <= 1, sr* = 0.
 */
export function expectedMaxSharpe(trials: number, variance: number): number {
  if (trials <= 1 || variance <= 0 || !Number.isFinite(trials) || !Number.isFinite(variance)) {
    return 0;
  }
  const std = Math.sqrt(variance);
  const z1 = inverseNormalCdf(1 - 1 / trials);
  const z2 = inverseNormalCdf(1 - 1 / (trials * Math.E));
  return std * ((1 - EULER_MASCHERONI) * z1 + EULER_MASCHERONI * z2);
}

/**
 * Deflated Sharpe Ratio (DSR) correcting for multiple testing bias and non-normality.
 * z = ((sr - sr*) * sqrt(nObs - 1)) / sqrt(1 - skew * sr + ((kurt - 1) / 4) * sr^2)
 * DSR = Phi(z)
 */
export function deflatedSharpeRatio(
  sr: number,
  srVar: number,
  trials: number,
  skew: number,
  kurt: number,
  nObs: number,
): number {
  if (nObs <= 1 || Number.isNaN(sr) || !Number.isFinite(nObs) || !Number.isFinite(sr)) {
    return 0;
  }
  const srStar = expectedMaxSharpe(trials, srVar);
  const denom = 1 - skew * sr + ((kurt - 1) / 4) * (sr * sr);
  const safeDenom = Math.max(1e-12, denom);
  const z = ((sr - srStar) * Math.sqrt(nObs - 1)) / Math.sqrt(safeDenom);
  return normalCdf(z);
}
