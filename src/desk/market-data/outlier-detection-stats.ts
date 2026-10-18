// SPDX-License-Identifier: MIT
/**
 * Outlier Detection Statistical & Window Helpers
 * Pure IQR bounds, volume window variance/stdDev, and Hampel/MAD filter helpers.
 */

import type { SymbolStats } from './outlier-detection-types';
import { percentile } from './outlier-statistical-helpers';

/**
 * Compute IQR lower and upper bounds for a price series.
 */
export function computePriceIQRBounds(
  prices: number[],
  iqrMultiplier: number,
): { min: number; max: number; q1: number; q3: number; iqr: number } {
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  return {
    min: q1 - iqrMultiplier * iqr,
    max: q3 + iqrMultiplier * iqr,
    q1,
    q3,
    iqr,
  };
}

/**
 * Compute sample mean and standard deviation for volume from running SymbolStats.
 */
export function computeVolumeWindowStats(stats: SymbolStats): {
  volumeMean: number;
  volumeStdDev: number;
} {
  if (stats.sampleCount <= 0) {
    return { volumeMean: 0, volumeStdDev: 0 };
  }
  const volumeMean = stats.volumeSum / stats.sampleCount;
  const volumeVariance =
    stats.sampleCount > 1
      ? (stats.volumeSumSq - (stats.volumeSum * stats.volumeSum) / stats.sampleCount) /
        (stats.sampleCount - 1)
      : 0;
  const volumeStdDev = Math.sqrt(Math.max(0, volumeVariance));
  return { volumeMean, volumeStdDev };
}

/**
 * Hampel filter outlier check using median and Median Absolute Deviation (MAD).
 */
export function isHampelOutlier(
  value: number,
  values: number[],
  threshold = 3.0,
): { isOutlier: boolean; median: number; mad: number } {
  if (values.length === 0) {
    return { isOutlier: false, median: 0, mad: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const absDevs = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = percentile(absDevs, 50) * 1.4826;
  if (mad === 0) {
    return { isOutlier: false, median, mad: 0 };
  }
  return {
    isOutlier: Math.abs(value - median) > threshold * mad,
    median,
    mad,
  };
}
