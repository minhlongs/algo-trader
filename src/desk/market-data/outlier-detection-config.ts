// SPDX-License-Identifier: MIT
/**
 * Outlier Detection default configuration, constants, and window/median math helpers.
 */

import { logger } from '../../shared/utils/logger';
import {
  recordOutlierEvent,
  recordOutlierZScore,
} from '../../platform/middleware/prometheus-metrics';
import type {
  OutlierDetectorConfig,
  OutlierEvent,
  OutlierSeverity,
  StatsWindow,
  SymbolStats,
} from './outlier-detection-types';
import { computeStatsFromWindow } from './outlier-statistical-helpers';

export const DEFAULT_CONFIG: OutlierDetectorConfig = {
  zScoreThreshold: 3.0,
  iqrMultiplier: 1.5,
  minSamples: 30,
  priceGapThreshold: 0.05,
  volumeSpikeThreshold: 3.0,
  windowSize: 100,
  callbackThreshold: 'medium',
};

export const SEVERITY_ORDER: Record<OutlierSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function computeMedianValue(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function resolveOutlierStatsAndWindow(
  input: SymbolStats | StatsWindow,
  sampleValue: number,
  mode: 'price' | 'volume',
): { stats: SymbolStats; window: StatsWindow } {
  const isStats = 'sampleCount' in input;
  const stats = isStats
    ? (input as SymbolStats)
    : computeStatsFromWindow(mode === 'price' ? (input as StatsWindow).prices : (input as StatsWindow).volumes);
  const window: StatsWindow = isStats
    ? {
        prices: mode === 'price' ? [sampleValue] : [],
        volumes: mode === 'volume' ? [sampleValue] : [],
        timestamps: [],
      }
    : (input as StatsWindow);
  return { stats, window };
}

export function dispatchOutlierEvent(
  event: OutlierEvent,
  callbackThreshold: OutlierSeverity,
  callbacks: Array<(event: OutlierEvent) => void>,
): void {
  try {
    recordOutlierEvent(event.provider, event.symbol, event.outlierType);
    if (event.zScore !== undefined) {
      recordOutlierZScore(event.provider, event.symbol, event.outlierType, event.zScore);
    }
  } catch (error) {
    logger.error('OutlierDetector: Metrics recording failed', { error });
  }
  if (SEVERITY_ORDER[event.severity] >= SEVERITY_ORDER[callbackThreshold]) {
    for (const cb of callbacks) {
      try {
        cb(event);
      } catch (error) {
        logger.error('OutlierDetector: Callback error', { error });
      }
    }
  }
}
