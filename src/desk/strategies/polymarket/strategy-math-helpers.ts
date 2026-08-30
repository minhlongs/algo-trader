/**
 * Shared math helper functions for Polymarket strategies.
 * Extracted from 30+ strategy files to enforce 200-line modularization rule.
 *
 * Functions: SMA, EMA, ATR, standard deviation, realized volatility,
 * OBI (order book imbalance), percentile rank, price range position.
 */

/** Arithmetic mean of an array. Returns 0 for empty array. */
export function calcMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Simple moving average. Returns 0 for empty array. */
export function calcSMA(prices: number[]): number {
  if (prices.length === 0) return 0;
  return prices.reduce((s, p) => s + p, 0) / prices.length;
}

/** Exponential moving average with given alpha. */
export function calcEMA(prices: number[], alpha?: number): number {
  if (prices.length === 0) return 0;
  const a = alpha ?? 2 / (prices.length + 1);
  let ema = prices[0]!;
  for (let i = 1; i < prices.length; i++) {
    ema = a * prices[i]! + (1 - a) * ema;
  }
  return ema;
}

/**
 * Average True Range: average |price[i] - price[i-1]| over the prices.
 * Returns 0 if fewer than 2 prices.
 */
export function calcATR(prices: number[]): number {
  if (prices.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < prices.length; i++) {
    sum += Math.abs(prices[i]! - prices[i - 1]!);
  }
  return sum / (prices.length - 1);
}

/** Standard deviation of an array. */
export function calcStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Realized volatility: std dev of log returns. */
export function calcRealizedVol(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1]! > 0) {
      returns.push(Math.log(prices[i]! / prices[i - 1]!));
    }
  }
  return calcStdDev(returns);
}

/** Order Book Imbalance: bidVol / askVol. */
export function calcOBI(bidVol: number, askVol: number): number {
  if (askVol <= 0) return bidVol > 0 ? Infinity : 1;
  return bidVol / askVol;
}

/** Percentile rank of value within sorted array (0-1 range). */
export function percentileRank(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 0.5;
  let count = 0;
  for (const v of sorted) {
    if (v <= value) count++;
  }
  return count / sorted.length;
}

/** Position of price within [low, high] range (0-1). Clamped. */
export function priceRangePosition(price: number, low: number, high: number): number {
  if (high <= low) return 0.5;
  return Math.max(0, Math.min(1, (price - low) / (high - low)));
}

/** Median of an array. */
export function calcMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Linear regression slope over price series. */
export function calcSlope(prices: number[]): number {
  const n = prices.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += prices[i]!;
    sumXY += i * prices[i]!;
    sumX2 += i * i;
  }
  // denom = n*sumX2 - sumX*sumX = n^2*(n-1)*(n+1)/12 > 0 for all n >= 2
  // (variance of the index series), so the division is always well-formed.
  const denom = n * sumX2 - sumX * sumX;
  return (n * sumXY - sumX * sumY) / denom;
}
