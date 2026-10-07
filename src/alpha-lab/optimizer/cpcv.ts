/**
 * Purged and Embargoed Cross-Validation (CPCV)
 *
 * Implements PurgedKFold and Embargoed Splits as per Prado/Advances in Financial ML.
 *
 * Purging: Removes training observations that overlap with test labels.
 * Embargoing: Removes training observations immediately FOLLOWING a test set observation.
 */

export interface TimeSplit {
  startIdx: number;
  endIdx: number;
}

export interface PurgeConfig {
  /** Bars to purge overlapping with test labels */
  purgeWindow: number;
  /** Bars to embargo after test period */
  embargoWindow: number;
}

/**
 * Creates indices for purging and embargoing training data.
 */
export function getPurgedIndices(
  trainSplit: TimeSplit,
  testSplit: TimeSplit,
  config: PurgeConfig,
  _totalBars: number,
): { startIdx: number; endIdx: number }[] {
  const { purgeWindow, embargoWindow } = config;

  // Indices to exclude from training based on test boundaries
  const testStart = testSplit.startIdx;
  const testEnd = testSplit.endIdx;

  // 1. Purge training data that overlaps with test data
  // Observed overlap: trainEnd intersects with testStart or testEnd intersects with trainStart
  const purgeStart = Math.max(trainSplit.startIdx, testStart - purgeWindow);
  const purgeEnd = Math.min(trainSplit.endIdx, testEnd + embargoWindow);

  // Remaining indices must be disjoint
  return [{ startIdx: trainSplit.startIdx, endIdx: purgeStart }, { startIdx: purgeEnd, endIdx: trainSplit.endIdx }];
}
