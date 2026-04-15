/**
 * Herd Behavior Math Helpers
 * Pure, stateless math functions for herd detection calculations.
 * All functions are exported for unit testing.
 */

/**
 * Calculate return from a price series: (last - first) / first.
 * Returns 0 if fewer than 2 prices or first is 0.
 */
export function calcReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  return (prices[prices.length - 1] - first) / first;
}

/**
 * Standard Pearson correlation coefficient between two arrays.
 * Returns 0 if arrays have different lengths, fewer than 2 elements,
 * or zero variance.
 */
export function calcPearsonR(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const n = x.length;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let covXY = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return covXY / Math.sqrt(varX * varY);
}

/**
 * Calculate average pairwise Pearson correlation across multiple return series.
 * Returns 0 if fewer than 2 series.
 */
export function calcAvgPairwiseCorrelation(returnSeries: number[][]): number {
  if (returnSeries.length < 2) return 0;

  let totalR = 0;
  let pairCount = 0;

  for (let i = 0; i < returnSeries.length; i++) {
    for (let j = i + 1; j < returnSeries.length; j++) {
      totalR += calcPearsonR(returnSeries[i], returnSeries[j]);
      pairCount++;
    }
  }

  if (pairCount === 0) return 0;
  return totalR / pairCount;
}

/**
 * Detect a herd peak: herding is above threshold AND intensity is declining
 * (current < prev), meaning herding just peaked.
 */
export function detectHerdPeak(
  prevHerdEma: number,
  currentHerdEma: number,
  threshold: number,
): boolean {
  return currentHerdEma > threshold && currentHerdEma < prevHerdEma;
}

/**
 * Determine the herd direction from an array of per-market returns.
 * 'up' if avg return > 0, 'down' if < 0, 'flat' if exactly 0.
 */
export function calcHerdDirection(returns: number[]): 'up' | 'down' | 'flat' {
  if (returns.length === 0) return 'flat';
  let sum = 0;
  for (const r of returns) sum += r;
  const avg = sum / returns.length;
  if (avg > 0) return 'up';
  if (avg < 0) return 'down';
  return 'flat';
}

/**
 * Update an exponential moving average with a simple alpha-based formula.
 * newEma = alpha * newValue + (1 - alpha) * prevEma
 * Returns newValue when there is no previous EMA (initial case).
 */
export function updateEma(prevEma: number | null, newValue: number, alpha: number): number {
  if (prevEma === null) return newValue;
  if (alpha <= 0) return prevEma;
  if (alpha >= 1) return newValue;
  return alpha * newValue + (1 - alpha) * prevEma;
}
