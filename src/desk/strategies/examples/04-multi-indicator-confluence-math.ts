/**
 * Technical Indicator Math Helpers for Multi-Indicator Confluence Strategy
 */

export function calculateEma(data: number[], period: number): number {
  const multiplier = 2 / (period + 1);
  let ema = data[0]!;
  for (let i = 1; i < data.length; i++) {
    ema = data[i]! * multiplier + ema * (1 - multiplier);
  }
  return ema;
}

export function calculateRsi(closes: number[], rsiPeriod: number): number {
  const recent = closes.slice(-rsiPeriod - 1);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < recent.length; i++) {
    const change = recent[i] - recent[i - 1]!;
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= rsiPeriod;
  avgLoss /= rsiPeriod;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateSma(data: number[], period: number): number {
  const recent = data.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

export function calculateStd(data: number[], mean: number): number {
  const squaredDiffs = data.map(x => Math.pow(x - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / data.length;
  return Math.sqrt(variance);
}
