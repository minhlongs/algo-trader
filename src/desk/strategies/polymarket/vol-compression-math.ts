/**
 * Vol Compression Breakout Mathematical Helpers
 * Pure calculation and signal detection functions
 */

export function calcRealizedVol(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

export function calcATR(prices: number[], period: number): number {
  if (prices.length < 2) return 0;
  const slice = prices.slice(-period - 1);
  if (slice.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < slice.length; i++) sum += Math.abs(slice[i] - slice[i - 1]);
  return sum / (slice.length - 1);
}

export function detectCompression(volShort: number, volLong: number, threshold: number): boolean {
  if (volLong <= 0) return false;
  return (volShort / volLong) < threshold;
}

export function detectBreakout(
  prices: number[],
  atr: number,
  multiplier: number,
): 'up' | 'down' | null {
  if (prices.length < 2 || atr <= 0) return null;
  const move = prices[prices.length - 1] - prices[prices.length - 2];
  if (move > multiplier * atr) return 'up';
  if (move < -(multiplier * atr)) return 'down';
  return null;
}
