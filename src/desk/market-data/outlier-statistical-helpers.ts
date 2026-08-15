// SPDX-License-Identifier: MIT
/**
 * Outlier Statistical Helpers
 * Pure utility functions for percentile calculation, severity scoring,
 * sliding window management, and z-score / IQR outlier checks.
 */

import type { OutlierSeverity, SymbolStats, StatsWindow } from './outlier-detection-types';

/** Calculate percentile value from a sorted array */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** Determine severity from a z-score magnitude */
export function calculateSeverity(zScore: number): OutlierSeverity {
  const abs = Math.abs(zScore);
  if (abs > 4.0) return 'critical';
  if (abs >= 3.0) return 'high';
  if (abs >= 2.0) return 'medium';
  return 'low';
}

/** Push a value into a fixed-size sliding window, evicting the oldest entry */
export function addToWindow(window: StatsWindow, price: number, volume: number, maxSize: number): void {
  window.prices.push(price);
  window.volumes.push(volume);
  window.timestamps.push(Date.now());
  if (window.prices.length > maxSize) {
    window.prices.shift();
    window.volumes.shift();
    window.timestamps.shift();
  }
}

/** Check if a value is an outlier via z-score */
export function isZScoreOutlier(
  value: number,
  mean: number,
  stdDev: number,
  threshold: number,
): { isOutlier: boolean; zScore: number } {
  if (stdDev === 0) return { isOutlier: false, zScore: 0 };
  const zScore = (value - mean) / stdDev;
  return { isOutlier: Math.abs(zScore) > threshold, zScore };
}

/** Check if a value is an outlier via IQR method */
export function isIQROutlier(
  value: number,
  sortedWindow: number[],
  multiplier: number,
): { isOutlier: boolean; min: number; max: number } {
  if (sortedWindow.length < 4) return { isOutlier: false, min: 0, max: 0 };
  const q1 = percentile(sortedWindow, 25);
  const q3 = percentile(sortedWindow, 75);
  const iqr = q3 - q1;
  const min = q1 - multiplier * iqr;
  const max = q3 + multiplier * iqr;
  return { isOutlier: value < min || value > max, min, max };
}

/** Create a fresh SymbolStats instance with default values */
export function createSymbolStats(): SymbolStats {
  return {
    sampleCount: 0, priceMean: 0, priceMedian: 0, variance: 0, stdDev: 0,
    min: Infinity, max: -Infinity, lastPrice: 0, lastVolume: 0,
    lastUpdate: 0, priceSum: 0, priceSumSq: 0, volumeSum: 0, volumeSumSq: 0,
  };
}

/** Incrementally update running stats with a new price and/or volume sample */
export function updateSymbolStats(stats: SymbolStats, price: number, volume: number): void {
  stats.sampleCount++;
  if (price > 0) {
    stats.priceSum += price;
    stats.priceSumSq += price * price;
    stats.priceMean = stats.priceSum / stats.sampleCount;
    stats.min = Math.min(stats.min, price);
    stats.max = Math.max(stats.max, price);
    stats.lastPrice = price;
    stats.variance = stats.sampleCount > 1
      ? (stats.priceSumSq - (stats.priceSum * stats.priceSum) / stats.sampleCount) / (stats.sampleCount - 1)
      : 0;
    stats.stdDev = Math.sqrt(Math.max(0, stats.variance));
  }
  if (volume > 0) {
    stats.volumeSum += volume;
    stats.volumeSumSq += volume * volume;
    stats.lastVolume = volume;
  }
  stats.lastUpdate = Date.now();
}

/** Compute a full SymbolStats from an array of numeric values */
export function computeStatsFromWindow(values: number[]): SymbolStats {
  const stats = createSymbolStats();
  if (values.length === 0) return stats;
  stats.sampleCount = values.length;
  for (const v of values) {
    stats.priceSum += v;
    stats.priceSumSq += v * v;
    stats.min = Math.min(stats.min, v);
    stats.max = Math.max(stats.max, v);
    stats.lastPrice = v;
  }
  stats.priceMean = stats.priceSum / stats.sampleCount;
  stats.variance = stats.sampleCount > 1
    ? (stats.priceSumSq - (stats.priceSum * stats.priceSum) / stats.sampleCount) / (stats.sampleCount - 1)
    : 0;
  stats.stdDev = Math.sqrt(Math.max(0, stats.variance));
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  stats.priceMedian = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  return stats;
}
