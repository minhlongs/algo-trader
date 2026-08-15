// SPDX-License-Identifier: MIT
/**
 * Outlier Detection Types
 * Shared types and interfaces for the outlier detection system
 */

import type { MarketDataSource } from './types';

/** Outlier event severity levels */
export type OutlierSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Types of outliers that can be detected */
export type OutlierType =
  | 'price_spike'
  | 'price_zscore'
  | 'price_iqr'
  | 'volume_spike'
  | 'volume_zscore'
  | 'volume_iqr'
  | 'price_gap';

/** An outlier event detected by the system */
export interface OutlierEvent {
  timestamp: number;
  symbol: string;
  outlierType: OutlierType;
  severity: OutlierSeverity;
  value: number;
  expectedRange: { min: number; max: number };
  zScore?: number;
  provider: MarketDataSource;
}

/** Running statistics for a symbol */
export interface SymbolStats {
  sampleCount: number;
  priceMean: number;
  priceMedian: number;
  variance: number;
  stdDev: number;
  min: number;
  max: number;
  lastPrice: number;
  lastVolume: number;
  lastUpdate: number;
  priceSum: number;
  priceSumSq: number;
  volumeSum: number;
  volumeSumSq: number;
}

/** Configuration for the outlier detector */
export interface OutlierDetectorConfig {
  zScoreThreshold: number;
  iqrMultiplier: number;
  minSamples: number;
  priceGapThreshold: number;
  volumeSpikeThreshold: number;
  windowSize: number;
  callbackThreshold: OutlierSeverity;
}

/** Sliding window of values for a symbol */
export interface StatsWindow {
  prices: number[];
  volumes: number[];
  timestamps: number[];
}
