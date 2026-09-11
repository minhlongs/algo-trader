/**
 * Pairs Statistical Arbitrage Strategy — Pure math calculations.
 */

import { calcSMA, calcStdDev } from './strategy-math-helpers';

/**
 * Spread between two markets: priceA - priceB.
 * For binary options on the same event, spread = P(event A) - P(event B).
 */
export function calcSpread(priceA: number, priceB: number): number {
  return priceA - priceB;
}

/**
 * Compute Bollinger upper and lower bands for a spread series.
 */
export function calcBollingerBands(spreads: number[], bandWidth: number): {
  mean: number; std: number; upper: number; lower: number;
} {
  if (spreads.length < 3) return { mean: 0, std: 0, upper: 0, lower: 0 };
  const mean = calcSMA(spreads);
  const std = calcStdDev(spreads);
  return { mean, std, upper: mean + bandWidth * std, lower: mean - bandWidth * std };
}

/**
 * Z-score of current spread relative to rolling distribution.
 */
export function calcSpreadZScore(current: number, spreads: number[]): number {
  if (spreads.length < 3) return 0;
  const mean = calcSMA(spreads);
  const std = calcStdDev(spreads);
  if (std <= 0) return 0;
  return (current - mean) / std;
}

/**
 * Pearson correlation between two price arrays (uses same-period returns).
 */
export function calcPairCorr(pricesA: number[], pricesB: number[]): number {
  const n = Math.min(pricesA.length, pricesB.length);
  if (n < 5) return 0;
  const retA: number[] = [];
  const retB: number[] = [];
  for (let i = 1; i < n; i++) {
    if (pricesA[i - 1]! > 0 && pricesB[i - 1]! > 0) {
      retA.push((pricesA[i]! - pricesA[i - 1]!) / pricesA[i - 1]!);
      retB.push((pricesB[i]! - pricesB[i - 1]!) / pricesB[i - 1]!);
    }
  }
  if (retA.length < 5) return 0;
  const meanA = retA.reduce((s, v) => s + v, 0) / retA.length;
  const meanB = retB.reduce((s, v) => s + v, 0) / retB.length;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < retA.length; i++) {
    const da = retA[i]! - meanA;
    const db = retB[i]! - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  return denom === 0 ? 0 : Math.max(-1, Math.min(1, num / denom));
}
