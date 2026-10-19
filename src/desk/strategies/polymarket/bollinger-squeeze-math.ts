/**
 * Pure mathematical indicator functions for Bollinger Band Squeeze.
 *
 * @module desk/strategies/polymarket/bollinger-squeeze-math
 */

export function calcSMA(prices: number[]): number {
  if (prices.length === 0) return 0;
  let sum = 0;
  for (const p of prices) sum += p;
  return sum / prices.length;
}

export function calcStdDev(prices: number[], mean: number): number {
  if (prices.length === 0) return 0;
  let sumSq = 0;
  for (const p of prices) {
    const diff = p - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / prices.length);
}

export function calcBands(
  sma: number,
  std: number,
  multiplier: number,
): { upper: number; lower: number; width: number } {
  const upper = sma + multiplier * std;
  const lower = sma - multiplier * std;
  const width = sma === 0 ? 0 : (upper - lower) / sma;
  return { upper, lower, width };
}

export function isSqueezing(currentWidth: number, avgWidth: number, threshold: number): boolean {
  return currentWidth < avgWidth * threshold;
}

export function detectBreakout(
  price: number,
  upper: number,
  lower: number,
): 'bullish' | 'bearish' | null {
  if (price > upper) return 'bullish';
  if (price < lower) return 'bearish';
  return null;
}
