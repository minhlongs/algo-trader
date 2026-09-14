/**
 * Mean Reversion Strategy Math Helpers.
 */

import { calcMean, calcStdDev } from './strategy-math-helpers';

/** Compute z-score of current price relative to rolling window stats. */
export function computeZScore(
  price: number,
  prices: number[],
): number {
  if (prices.length < 3) return 0;
  const mean = calcMean(prices);
  const std = calcStdDev(prices);
  if (std <= 0) return 0;
  return (price - mean) / std;
}

/** Determine trade direction: buy yes if price is below mean (negative z-score), buy no if above. */
export function getMrDirection(zScore: number): 'yes' | 'no' | null {
  if (Math.abs(zScore) < 0.5) return null; // neutral zone
  return zScore < 0 ? 'yes' : 'no';
}
