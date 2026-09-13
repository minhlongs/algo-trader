/**
 * Regime Detector Math
 * Pure statistical calculations for volatility and spread distributions
 */

export function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * 100;
}

export function calculateSpreadStats(spreads: number[]): { avg: number; stdDev: number } {
  if (spreads.length === 0) return { avg: 0, stdDev: 0 };

  const avg = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const variance = spreads.reduce((a, s) => a + Math.pow(s - avg, 2), 0) / spreads.length;

  return { avg, stdDev: Math.sqrt(variance) };
}
