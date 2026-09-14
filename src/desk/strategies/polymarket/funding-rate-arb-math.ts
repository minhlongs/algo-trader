import type { RawOrderBook } from '../../polymarket/clob-client';
import { calcSMA, calcStdDev } from './strategy-math-helpers';

/**
 * Estimate implied funding rate from order book.
 *
 * For binary options, funding is proxied by the bid-ask skew:
 * if the ask side is much deeper, "going long" is cheap (negative funding).
 * if the bid side is much deeper, "going long" is expensive (positive funding).
 *
 * Returns a signed value where > 0 = positive funding (longs pay shorts).
 */
export function estimateImpliedFundingRate(book: RawOrderBook): number {
  const bids = book.bids.slice(0, 5);
  const asks = book.asks.slice(0, 5);

  const bidDepth = bids.reduce((s, l) => s + parseFloat(l.price) * parseFloat(l.size), 0);
  const askDepth = asks.reduce((s, l) => s + parseFloat(l.price) * parseFloat(l.size), 0);

  const total = bidDepth + askDepth;
  if (total <= 0) return 0;

  // Normalized to [-1, 1]: positive = bid-heavy = long bias (positive implied funding)
  return (bidDepth - askDepth) / total;
}

/**
 * Compute implied funding annualized from order book pressure.
 * Scales the [-1, 1] raw value to an annualized percentage.
 */
export function annualizeFundingRate(raw: number): number {
  // Scale factor converts raw imbalance to annualized rate estimate
  return raw * 0.15; // Max ~15% annualized when book is fully skewed
}

/**
 * Calculate which percentile rank the current rate occupies.
 */
export function calcPercentile(value: number, history: number[]): number {
  if (history.length === 0) return 0.5;
  let min = Infinity;
  let max = -Infinity;
  for (const v of history) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Z-score of current implied rate relative to its history.
 */
export function calcFundingRateZScore(current: number, history: number[]): number {
  if (history.length < 3) return 0;
  const mean = calcSMA(history);
  const std = calcStdDev(history);
  if (std <= 0) return 0;
  return Math.abs(current - mean) / std;
}
