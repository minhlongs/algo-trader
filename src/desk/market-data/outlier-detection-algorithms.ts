// SPDX-License-Identifier: MIT
/**
 * Outlier Detection Algorithms
 * Stateless detection logic for price outliers, volume spikes, and price gaps.
 */

import type { MarketDataSource } from './types';
import type {
  OutlierEvent,
  OutlierDetectorConfig,
  SymbolStats,
  StatsWindow,
} from './outlier-detection-types';
import {
  isZScoreOutlier,
  isIQROutlier,
  calculateSeverity,
  percentile,
} from './outlier-statistical-helpers';

/**
 * Detect price outliers using z-score and IQR on the symbol's sliding window.
 * If currentPrice is provided, it is checked against the window's historical stats;
 * otherwise the last value in window.prices is used.
 */
export function detectPriceOutliers(
  symbol: string,
  stats: SymbolStats,
  window: StatsWindow,
  config: OutlierDetectorConfig,
  provider: MarketDataSource,
  currentPriceOverride?: number,
): OutlierEvent[] {
  const events: OutlierEvent[] = [];
  if (stats.sampleCount < config.minSamples || window.prices.length < config.minSamples) {
    return events;
  }

  const currentPrice = currentPriceOverride ?? window.prices[window.prices.length - 1];

  // Z-score check
  const zResult = isZScoreOutlier(currentPrice, stats.priceMean, stats.stdDev, config.zScoreThreshold);
  if (zResult.isOutlier) {
    events.push({
      timestamp: Date.now(),
      symbol,
      outlierType: 'price_spike',
      severity: calculateSeverity(zResult.zScore),
      value: currentPrice,
      expectedRange: {
        min: stats.priceMean - config.zScoreThreshold * stats.stdDev,
        max: stats.priceMean + config.zScoreThreshold * stats.stdDev,
      },
      zScore: zResult.zScore,
      provider,
    });
  }

  // IQR check
  const sorted = [...window.prices].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const iqrMin = q1 - config.iqrMultiplier * iqr;
  const iqrMax = q3 + config.iqrMultiplier * iqr;
  if (currentPrice < iqrMin || currentPrice > iqrMax) {
    events.push({
      timestamp: Date.now(),
      symbol,
      outlierType: 'price_iqr',
      severity: calculateSeverity((currentPrice - stats.priceMean) / (stats.stdDev || 1)),
      value: currentPrice,
      expectedRange: { min: iqrMin, max: iqrMax },
      provider,
    });
  }

  return events;
}

/**
 * Detect volume spikes using z-score and IQR on the symbol's sliding window.
 * If currentVolumeOverride is provided, it is checked against the window's historical stats;
 * otherwise the last value in window.volumes is used.
 */
export function detectVolumeOutliers(
  symbol: string,
  stats: SymbolStats,
  window: StatsWindow,
  config: OutlierDetectorConfig,
  provider: MarketDataSource,
  currentVolumeOverride?: number,
): OutlierEvent[] {
  const events: OutlierEvent[] = [];
  if (stats.sampleCount < config.minSamples || window.volumes.length < config.minSamples) {
    return events;
  }

  const currentVolume = currentVolumeOverride ?? window.volumes[window.volumes.length - 1];
  const volumeMean = stats.volumeSum / stats.sampleCount;
  const volumeVariance = stats.sampleCount > 1
    ? (stats.volumeSumSq - (stats.volumeSum * stats.volumeSum) / stats.sampleCount) / (stats.sampleCount - 1)
    : 0;
  const volumeStdDev = Math.sqrt(Math.max(0, volumeVariance));

  // Z-score check
  const zResult = isZScoreOutlier(currentVolume, volumeMean, volumeStdDev, config.volumeSpikeThreshold);
  if (zResult.isOutlier) {
    events.push({
      timestamp: Date.now(),
      symbol,
      outlierType: 'volume_spike',
      severity: calculateSeverity(zResult.zScore),
      value: currentVolume,
      expectedRange: {
        min: Math.max(0, volumeMean - config.volumeSpikeThreshold * volumeStdDev),
        max: volumeMean + config.volumeSpikeThreshold * volumeStdDev,
      },
      zScore: zResult.zScore,
      provider,
    });
  }

  // IQR check
  const sorted = [...window.volumes].sort((a, b) => a - b);
  const iqrResult = isIQROutlier(currentVolume, sorted, config.iqrMultiplier);
  if (iqrResult.isOutlier) {
    events.push({
      timestamp: Date.now(),
      symbol,
      outlierType: 'volume_iqr',
      severity: calculateSeverity((currentVolume - volumeMean) / (volumeStdDev || 1)),
      value: currentVolume,
      expectedRange: { min: iqrResult.min, max: iqrResult.max },
      provider,
    });
  }

  return events;
}

/**
 * Detect sudden price gaps between consecutive observations.
 */
export function detectPriceGap(
  symbol: string,
  prevPrice: number,
  currentPrice: number,
  config: OutlierDetectorConfig,
  provider: MarketDataSource,
): OutlierEvent | null {
  if (prevPrice === 0) return null;
  const gapPercent = Math.abs((currentPrice - prevPrice) / prevPrice);
  if (gapPercent < config.priceGapThreshold) return null;

  const zScore = gapPercent / config.priceGapThreshold;
  return {
    timestamp: Date.now(),
    symbol,
    outlierType: 'price_gap',
    severity: calculateSeverity(zScore),
    value: currentPrice,
    expectedRange: {
      min: prevPrice * (1 - config.priceGapThreshold),
      max: prevPrice * (1 + config.priceGapThreshold),
    },
    zScore,
    provider,
  };
}
