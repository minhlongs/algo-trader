/**
 * Pure helper math functions for Session Volatility Sniper
 */

/** Average True Range from a series of mid-price snapshots. */
export function calcATR(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0;
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += Math.abs(prices[i] - prices[i - 1]);
  }
  return sum / period;
}

/** Simple arithmetic mean. */
export function calcAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Check if short ATR exceeds long-run average by the multiplier. */
export function detectSpike(shortAtr: number, longAvgAtr: number, multiplier: number): boolean {
  if (longAvgAtr <= 0) return false;
  return shortAtr >= longAvgAtr * multiplier;
}

/** Check if short ATR has mean-reverted to at or below the long average. */
export function detectMeanReversion(shortAtr: number, longAvgAtr: number): boolean {
  return longAvgAtr > 0 && shortAtr <= longAvgAtr;
}
