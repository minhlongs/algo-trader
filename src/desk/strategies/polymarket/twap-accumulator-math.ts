/**
 * TWAP Accumulator Strategy — Pure math and helper functions.
 */

/** Average fill price from accumulated slices. */
export function computeAverageEntryPrice(entryPrices: number[]): number {
  if (entryPrices.length === 0) return 0;
  return entryPrices.reduce((s, p) => s + p, 0) / entryPrices.length;
}

/** Check if enough time has passed since the last slice. */
export function isSliceDue(lastSliceAt: number, intervalMs: number): boolean {
  return Date.now() - lastSliceAt >= intervalMs;
}

/** Determine whether to accumulate YES or NO based on price position. */
export function getAccumulationDirection(midPrice: number, threshold: number): 'yes' | 'no' | null {
  if (midPrice <= threshold) return 'yes';   // cheap -> accumulate YES
  if (midPrice >= 1 - threshold) return 'no'; // expensive -> accumulate NO (expect reversion)
  return null;
}
