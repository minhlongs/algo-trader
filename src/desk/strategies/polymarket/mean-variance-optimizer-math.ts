/**
 * Mean-Variance Optimizer Pure Math Helpers
 * Extracted from mean-variance-optimizer-v2.ts for modular statistical evaluation.
 */

export function calcExpectedReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  return (prices[prices.length - 1] - first) / first;
}

export function calcVariance(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] === 0) {
      returns.push(0);
    } else {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  if (returns.length === 0) return 0;
  let sum = 0;
  for (const r of returns) sum += r;
  const mean = sum / returns.length;
  let sqSum = 0;
  for (const r of returns) sqSum += (r - mean) ** 2;
  return sqSum / returns.length;
}

export function calcSharpeRatio(expectedReturn: number, variance: number): number {
  if (variance <= 0) return 0;
  return expectedReturn / Math.sqrt(variance);
}

export function selectBestMarket(
  candidates: { id: string; ratio: number }[],
  minRatio: number,
): { id: string; ratio: number } | null {
  let best: { id: string; ratio: number } | null = null;
  let bestAbs = 0;
  for (const c of candidates) {
    const absRatio = Math.abs(c.ratio);
    if (absRatio >= minRatio && absRatio > bestAbs) {
      best = c;
      bestAbs = absRatio;
    }
  }
  return best;
}
