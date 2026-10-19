/**
 * Mathematical calculations for Barndorff-Nielsen & Shephard (2004) BPV.
 * Strictly < 180 LOC, zero :any types.
 */

import { JumpTestResult } from './bipower-types';

export const PI_OVER_TWO = Math.PI / 2.0; // 1.5707963267948966 (mu_1^-2)
export const MU_FOUR_THIRDS_MINUS_THREE = 1.743306; // mu_(4/3)^-3 constant for TPQ
export const BNS_VAR_CONSTANT = (Math.PI * Math.PI) / 4.0 + Math.PI - 3.0; // ~0.60907

export function computeRealizedVariance(returns: readonly number[]): number {
  let sum = 0;
  for (const r of returns) sum += r * r;
  return sum;
}

export function computeBipowerVariation(returns: readonly number[]): number {
  const n = returns.length;
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 1; i < n; i++) {
    sum += Math.abs(returns[i]) * Math.abs(returns[i - 1]);
  }
  // BV = (pi / 2) * (N / (N - 1)) * sum(|r_i| * |r_{i-1}|)
  const finiteSampleCorrection = n / (n - 1);
  return PI_OVER_TWO * finiteSampleCorrection * sum;
}

export function computeTripowerQuarticity(returns: readonly number[]): number {
  const n = returns.length;
  if (n < 3) return 1e-8;
  let sum = 0;
  const power = 4.0 / 3.0;
  for (let i = 2; i < n; i++) {
    sum +=
      Math.pow(Math.abs(returns[i]), power) *
      Math.pow(Math.abs(returns[i - 1]), power) *
      Math.pow(Math.abs(returns[i - 2]), power);
  }
  const finiteSampleCorrection = (n * n) / ((n - 1) * (n - 2));
  return n * MU_FOUR_THIRDS_MINUS_THREE * finiteSampleCorrection * sum;
}

// Approximation of standard normal complementary CDF (one-sided p-value)
export function standardNormalSurvival(z: number): number {
  if (z <= 0) return 0.5 + 0.5 * erf(-z / Math.SQRT2);
  return 0.5 - 0.5 * erf(z / Math.SQRT2);
}

function erf(x: number): number {
  // Abramowitz and Stegun 7.1.26 polynomial approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

export function evaluateBnsJumpTest(
  returns: readonly number[],
  criticalZ = 2.326 // 99% one-sided threshold
): JumpTestResult {
  const n = returns.length;
  if (n < 5) {
    throw new Error('BNS jump test requires at least 5 intraday returns');
  }

  const rv = computeRealizedVariance(returns);
  const bv = computeBipowerVariation(returns);
  const tpq = computeTripowerQuarticity(returns);

  const continuousVariance = Math.min(rv, bv);
  const jumpVariance = Math.max(0, rv - bv);
  const jumpProportion = rv > 1e-12 ? jumpVariance / rv : 0;

  // Asymptotic jump test statistic: Z = ( (RV - BV)/RV ) / sqrt(vartheta * (1/N) * max(1, TPQ / BV^2))
  let zStatistic = 0;
  if (rv > 1e-12 && bv > 1e-12) {
    const quarticityRatio = Math.max(1.0, tpq / (bv * bv));
    const denom = Math.sqrt(BNS_VAR_CONSTANT * (1.0 / n) * quarticityRatio);
    if (denom > 1e-12) {
      zStatistic = (rv - bv) / (rv * denom);
    }
  }

  const isJumpDay = zStatistic > criticalZ;
  const pValue = standardNormalSurvival(zStatistic);

  return {
    sampleCount: n,
    realizedVariance: rv,
    bipowerVariation: bv,
    continuousVariance,
    jumpVariance,
    jumpProportion,
    tripowerQuarticity: tpq,
    zStatistic,
    isJumpDay,
    criticalValue: criticalZ,
    pValue,
  };
}
