// SPDX-License-Identifier: MIT
/**
 * Outlier Detection System
 * Statistical anomaly detection for prices and volumes
 */

import { logger } from '../../shared/utils/logger';
import type { Candle, MarketDataSource } from './types';
import {
  recordOutlierEvent,
  recordOutlierZScore,
} from '../../platform/middleware/prometheus-metrics';

/**
 * Configuration for outlier detection
 */
export interface OutlierDetectorConfig {
  /** Z-score threshold for outlier detection (default: 3.0) */
  zScoreThreshold: number;
  /** IQR multiplier for outlier detection (default: 1.5) */
  iqrMultiplier: number;
  /** Minimum samples required before detection (default: 30) */
  minSamples: number;
  /** Rolling window size (default: 100) */
  windowSize: number;
  /** Whether to record metrics */
  enableMetrics: boolean;
}

/**
 * Rolling statistics window
 */
export interface StatsWindow {
  values: number[];
  sum: number;
  sumOfSquares: number;
  sorted: number[];
  sortedDirty: boolean;
}

/**
 * Outlier event
 */
// export interface OutlierEvent { // Already in types.ts
//   symbol: string;
//   timestamp: number;
//   outlierType: 'price_spike' | 'volume_anomaly' | 'price_gap';
//   severity: 'low' | 'medium' | 'high' | 'critical';
//   value: number;
//   expectedRange: [number, number];
//   zScore?: number;
//   iqrScore?: number;
// }

/**
 * Outlier Detector
 *
 * Uses rolling windows and statistical methods (Z-score, IQR) to detect
 * anomalies in price and volume data.
 */
export class OutlierDetector {
  private config: Required<OutlierDetectorConfig>;
  private priceWindows: Map<string, StatsWindow>;
  private volumeWindows: Map<string, StatsWindow>;
  private outlierCallbacks: Set<(event: any) => void>;

  constructor(config: Partial<OutlierDetectorConfig> = {}) {
    this.config = {
      zScoreThreshold: config.zScoreThreshold ?? 3.0,
      iqrMultiplier: config.iqrMultiplier ?? 1.5,
      minSamples: config.minSamples ?? 30,
      windowSize: config.windowSize ?? 100,
      enableMetrics: config.enableMetrics ?? true,
    };
    this.priceWindows = new Map();
    this.volumeWindows = new Map();
    this.outlierCallbacks = new Set();
  }

  /**
   * Add a price sample for a symbol
   */
  addPriceSample(symbol: string, price: number, provider?: MarketDataSource): void {
    this.addToWindow(this.priceWindows, symbol, price);
  }

  /**
   * Add a volume sample for a symbol
   */
  addVolumeSample(symbol: string, volume: number, provider?: MarketDataSource): void {
    this.addToWindow(this.volumeWindows, symbol, volume);
  }

  /**
   * Add a candle (extracts price and volume)
   */
  addCandle(candle: Candle, provider?: MarketDataSource): void {
    const price = parseFloat(candle.close);
    const volume = parseFloat(candle.volume);
    this.addPriceSample(candle.symbol, price, provider);
    this.addVolumeSample(candle.symbol, volume, provider);
  }

  /**
   * Detect price outlier using Z-score and IQR
   */
  detectPriceOutlier(symbol: string, currentPrice: number, window: StatsWindow): any {
    if (window.values.length < this.config.minSamples) {
      return null;
    }

    // Calculate mean and std dev
    const mean = window.sum / window.values.length;
    const variance = (window.sumOfSquares / window.values.length) - (mean * mean);
    const stdDev = Math.sqrt(variance);

    // Z-score
    const zScore = stdDev > 0 ? Math.abs((currentPrice - mean) / stdDev) : 0;

    // IQR
    if (window.sortedDirty) {
      window.sorted = [...window.values].sort((a, b) => a - b);
      window.sortedDirty = false;
    }
    const q1 = this.percentile(window.sorted, 25);
    const q3 = this.percentile(window.sorted, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - this.config.iqrMultiplier * iqr;
    const upperBound = q3 + this.config.iqrMultiplier * iqr;
    const iqrScore = currentPrice < lowerBound ? (lowerBound - currentPrice) / iqr :
                     currentPrice > upperBound ? (currentPrice - upperBound) / iqr : 0;

    // Determine if outlier
    const isZScoreOutlier = zScore >= this.config.zScoreThreshold;
    const isIqrOutlier = currentPrice < lowerBound || currentPrice > upperBound;

    if (isZScoreOutlier || isIqrOutlier) {
      const severity = this.calculateSeverity(zScore, iqrScore, currentPrice, [lowerBound, upperBound]);
      const outlier: any = {
        symbol,
        timestamp: Date.now(),
        outlierType: 'price_spike' as const,
        severity,
        value: currentPrice,
        expectedRange: [lowerBound, upperBound],
        zScore,
        iqrScore: iqrScore > 0 ? iqrScore : undefined,
      };

      if (this.config.enableMetrics) {
        recordOutlierEvent(symbol, 'price_spike', severity);
        recordOutlierZScore(symbol, 'price_spike', zScore);
      }

      this.emitOutlier(outlier);
      return outlier;
    }

    return null;
  }

  /**
   * Detect volume outlier
   */
  detectVolumeOutlier(symbol: string, currentVolume: number, window: StatsWindow): any {
    if (window.values.length < this.config.minSamples) {
      return null;
    }

    const mean = window.sum / window.values.length;
    const variance = (window.sumOfSquares / window.values.length) - (mean * mean);
    const stdDev = Math.sqrt(variance);
    const zScore = stdDev > 0 ? Math.abs((currentVolume - mean) / stdDev) : 0;

    if (window.sortedDirty) {
      window.sorted = [...window.values].sort((a, b) => a - b);
      window.sortedDirty = false;
    }
    const q1 = this.percentile(window.sorted, 25);
    const q3 = this.percentile(window.sorted, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - this.config.iqrMultiplier * iqr;
    const upperBound = q3 + this.config.iqrMultiplier * iqr;

    const isZScoreOutlier = zScore >= this.config.zScoreThreshold;
    const isIqrOutlier = currentVolume < lowerBound || currentVolume > upperBound;

    if (isZScoreOutlier || isIqrOutlier) {
      const severity = this.calculateSeverity(zScore, currentVolume < lowerBound ? (lowerBound - currentVolume) / iqr : (currentVolume - upperBound) / iqr, currentVolume, [lowerBound, upperBound]);
      const outlier: any = {
        symbol,
        timestamp: Date.now(),
        outlierType: 'volume_anomaly' as const,
        severity,
        value: currentVolume,
        expectedRange: [lowerBound, upperBound],
        zScore,
        iqrScore: undefined,
      };

      if (this.config.enableMetrics) {
        recordOutlierEvent(symbol, 'volume_anomaly', severity);
        recordOutlierZScore(symbol, 'volume_anomaly', zScore);
      }

      this.emitOutlier(outlier);
      return outlier;
    }

    return null;
  }

  /**
   * Detect price gap between two consecutive prices
   */
  detectPriceGap(symbol: string, prevPrice: number, currentPrice: number, provider: MarketDataSource): any {
    const percentChange = Math.abs((currentPrice - prevPrice) / prevPrice) * 100;

    // Thresholds for gap detection
    const gapThresholds = {
      low: 1,      // 1% gap
      medium: 3,   // 3% gap
      high: 20,     // 5% gap
      critical: 50, // 10% gap
    };

    let severity: 'low' | 'medium' | 'high' | 'critical';
    if (percentChange >= gapThresholds.critical) {
      severity = 'critical';
    } else if (percentChange >= gapThresholds.high) {
      severity = 'high';
    } else if (percentChange >= gapThresholds.medium) {
      severity = 'medium';
    } else if (percentChange >= gapThresholds.low) {
      severity = 'low';
    } else {
      return null;
    }

    const gap = Math.abs(currentPrice - prevPrice);
    const expectedMaxChange = prevPrice * (gapThresholds.low / 100);
    const outlier: any = {
      symbol,
      timestamp: Date.now(),
      outlierType: 'price_gap' as const,
      severity,
      value: gap,
      expectedRange: [0, expectedMaxChange],
    };

    if (this.config.enableMetrics) {
      recordOutlierEvent(symbol, 'price_gap', severity);
    }

    this.emitOutlier(outlier);
    return outlier;
  }

  /**
   * Get statistics for a symbol
   */
  getStats(symbol: string): { priceMean?: number; priceMedian?: number; volumeMean?: number; volumeMedian?: number; sampleCount: number } | null {
    const priceWindow = this.priceWindows.get(symbol);
    const volumeWindow = this.volumeWindows.get(symbol);

    if (!priceWindow && !volumeWindow) {
      return null;
    }

    const result: any = { sampleCount: priceWindow?.values.length || volumeWindow?.values.length || 0 };

    if (priceWindow && priceWindow.values.length > 0) {
      const sorted = [...priceWindow.values].sort((a, b) => a - b);
      result.priceMean = priceWindow.sum / priceWindow.values.length;
      result.priceMedian = this.percentile(sorted, 50);
    }

    if (volumeWindow && volumeWindow.values.length > 0) {
      const sorted = [...volumeWindow.values].sort((a, b) => a - b);
      result.volumeMean = volumeWindow.sum / volumeWindow.values.length;
      result.volumeMedian = this.percentile(sorted, 50);
    }

    return result;
  }

  /**
   * Clear statistics for a symbol
   */
  clearSymbol(symbol: string): void {
    this.priceWindows.delete(symbol);
    this.volumeWindows.delete(symbol);
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.priceWindows.clear();
    this.volumeWindows.clear();
  }

  /**
   * Register callback for outlier events
   */
  onOutlier(callback: (event: any) => void): void {
    this.outlierCallbacks.add(callback);
  }

  /**
   * Remove outlier callback
   */
  offOutlier(callback: (event: any) => void): void {
    this.outlierCallbacks.delete(callback);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private addToWindow(windows: Map<string, StatsWindow>, symbol: string, value: number): void {
    let window = windows.get(symbol);
    if (!window) {
      window = {
        values: [],
        sum: 0,
        sumOfSquares: 0,
        sorted: [],
        sortedDirty: false,
      };
      windows.set(symbol, window);
    }

    // Add new value
    window.values.push(value);
    window.sum += value;
    window.sumOfSquares += value * value;
    window.sortedDirty = true;

    // Trim to window size
    if (window.values.length > this.config.windowSize) {
      const removed = window.values.shift()!;
      window.sum -= removed;
      window.sumOfSquares -= removed * removed;
      window.sortedDirty = true;
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private calculateSeverity(zScore: number, iqrScore: number, value: number, range: [number, number]): 'low' | 'medium' | 'high' | 'critical' {
    // Use the larger of zScore and iqrScore to determine severity
    const score = Math.max(zScore, iqrScore);

    if (score >= 5) return 'critical';
    if (score >= 3) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  private emitOutlier(event: any): void {
    for (const callback of this.outlierCallbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error('OutlierDetector: Callback error', { error });
      }
    }
  }
}

/**
 * Singleton instance
 */
let outlierDetectorInstance: OutlierDetector | null = null;

export function getOutlierDetector(): OutlierDetector {
  if (!outlierDetectorInstance) {
    outlierDetectorInstance = new OutlierDetector();
  }
  return outlierDetectorInstance;
}

export function initializeOutlierDetector(config?: Partial<OutlierDetectorConfig>): OutlierDetector {
  outlierDetectorInstance = new OutlierDetector(config);
  return outlierDetectorInstance;
}
