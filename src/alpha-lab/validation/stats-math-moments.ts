/**
 * Sample Higher-Order Moment Helpers (Skewness & Kurtosis)
 *
 * Extracted from stats-math.ts to keep modules under 155 LOC.
 *
 * @module alpha-lab/validation/stats-math-moments
 */

/**
 * Fisher-Pearson coefficient of sample skewness.
 */
export function computeSkewness(data: readonly number[]): number {
  const n = data.length;
  if (n < 3) return 0;
  const meanVal = data.reduce((sum, v) => sum + v, 0) / n;
  let m2 = 0;
  let m3 = 0;
  for (let i = 0; i < n; i++) {
    const diff = data[i] - meanVal;
    m2 += diff * diff;
    m3 += diff * diff * diff;
  }
  const variance = m2 / n;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (m3 / n) / (stdDev * stdDev * stdDev);
}

/**
 * Pearson kurtosis (uncentered, normal distribution = 3).
 */
export function computeKurtosis(data: readonly number[]): number {
  const n = data.length;
  if (n < 4) return 3;
  const meanVal = data.reduce((sum, v) => sum + v, 0) / n;
  let m2 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const diff = data[i] - meanVal;
    m2 += diff * diff;
    m4 += diff * diff * diff * diff;
  }
  const variance = m2 / n;
  if (variance === 0) return 3;
  return (m4 / n) / (variance * variance);
}
