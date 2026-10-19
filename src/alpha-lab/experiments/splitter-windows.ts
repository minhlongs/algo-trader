/**
 * Walk-Forward Splitter Window Resolution & Ratio Validation
 */

import type { SplitConfig } from './experiment-types';

export function assertValidRatios(config: SplitConfig): void {
  const { trainRatio, valRatio, testRatio } = config;
  const sum = trainRatio + valRatio + testRatio;
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`Split ratios must sum to 1: got train=${trainRatio}, val=${valRatio}, test=${testRatio}`);
  }
  for (const r of [trainRatio, valRatio, testRatio]) {
    if (r <= 0 || r >= 1) throw new Error(`Split ratio must be in (0,1): got ${r}`);
  }
  if (config.numFolds !== undefined && config.numFolds < 1) {
    throw new Error(`numFolds must be >= 1: got ${config.numFolds}`);
  }
}

/**
 * Compute window sizes from config.
 *
 * For EXPANDING: baseTrain is used as the starting train size.
 * For ROLLING: all three windows are derived.
 *
 * Explicit window sizes take precedence over ratio-derived sizes.
 */
export function resolveWindows(config: SplitConfig, usable: number): {
  trainW: number;
  valW: number;
  testW: number;
} {
  const numFolds = config.numFolds;
  const isMultiFold = (numFolds !== undefined && numFolds >= 2) || config.testWindowSize !== undefined;

  let trainW: number;
  let valW: number;
  let testW: number;

  if (isMultiFold) {
    const folds = Math.max(1, numFolds ?? 5);
    valW = config.valWindowSize ?? Math.max(1, Math.floor(usable * config.valRatio));
    if (config.testWindowSize !== undefined) {
      testW = config.testWindowSize;
      trainW = config.trainWindowSize ?? Math.max(1, usable - valW - folds * testW);
    } else if (config.trainWindowSize !== undefined) {
      trainW = config.trainWindowSize;
      const remaining = Math.max(folds, usable - trainW - valW);
      testW = Math.max(1, Math.floor(remaining / folds));
    } else {
      testW = Math.max(1, Math.floor((usable * config.testRatio) / folds));
      trainW = Math.max(1, usable - valW - folds * testW);
    }
  } else {
    trainW = config.trainWindowSize ?? Math.floor(usable * config.trainRatio);
    valW = config.valWindowSize ?? Math.floor(usable * config.valRatio);
    testW = Math.max(1, usable - trainW - valW);
  }

  return { trainW, valW, testW };
}
