/**
 * Financial math utilities for Sharpe ratio and max drawdown calculations.
 */

/**
 * Calculate Sharpe Ratio (annualized)
 */
export function calculateSharpeRatio(dailyPnl: { profit: number }[]): number {
  if (dailyPnl.length < 2) return 0;

  const returns = dailyPnl.map((d) => d.profit);
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualize: * sqrt(252) for trading days
  const riskFreeRate = 0.05 / 252; // Assume 5% annual
  return ((avg - riskFreeRate) / stdDev) * Math.sqrt(252);
}

/**
 * Calculate maximum drawdown
 */
export function calculateMaxDrawdown(dailyPnl: { profit: number }[]): number {
  if (dailyPnl.length === 0) return 0;

  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;

  for (const day of dailyPnl) {
    cumulative += day.profit;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = peak === 0 ? 0 : (peak - cumulative) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}
