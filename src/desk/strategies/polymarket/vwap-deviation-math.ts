/**
 * Pure mathematical helpers for VWAP deviation calculations.
 */

export function calcVWAP(prices: number[], volumes: number[]): number {
  if (prices.length === 0 || volumes.length === 0) return 0;
  if (prices.length !== volumes.length) return 0;

  let sumPV = 0;
  let sumV = 0;

  for (let i = 0; i < prices.length; i++) {
    if (volumes[i] <= 0) continue;
    sumPV += prices[i] * volumes[i];
    sumV += volumes[i];
  }

  if (sumV === 0) return 0;
  return sumPV / sumV;
}

export function calcDeviation(price: number, vwap: number): number {
  if (vwap === 0) return 0;
  return (price - vwap) / vwap;
}

export function calcStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  let sumSq = 0;
  for (const x of values) {
    const diff = x - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / values.length);
}

export function calcZScore(value: number, history: number[]): number {
  if (history.length < 2) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const stdDev = calcStdDev(history, mean);
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

export function determineSignal(
  zScore: number,
  threshold: number,
): 'yes' | 'no' | null {
  if (zScore < -threshold) return 'yes';
  if (zScore > threshold) return 'no';
  return null;
}
