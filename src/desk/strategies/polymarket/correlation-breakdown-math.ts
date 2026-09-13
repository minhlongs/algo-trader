/**
 * Correlation Breakdown Strategy — Statistical math helpers.
 */

import { calcStdDev } from './strategy-math-helpers';

/**
 * Pearson correlation coefficient between two equal-length arrays.
 * Returns 0 for insufficient data or zero variance.
 */
export function calcPearsonR(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;

  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const denom = Math.sqrt(denA * denB);
  return denom === 0 ? 0 : Math.max(-1, Math.min(1, num / denom));
}

/**
 * Z-score of current correlation relative to its rolling distribution.
 */
export function calcCorrZScore(current: number, history: number[]): number {
  const mean = history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0;
  const std = history.length > 1 ? calcStdDev(history) : 0.2;
  if (std <= 0) return 0;
  return (mean - current) / std; // positive when current is below mean
}
