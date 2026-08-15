// SPDX-License-Identifier: MIT
/**
 * Outlier Detection System — thin orchestrator.
 * Delegates detection math and stats to focused sub-modules.
 * Barrel re-exports preserve backward compatibility.
 */

import { logger } from '../../shared/utils/logger';
import { MarketDataSource } from './types';
import type { Candle } from './types';
import {
  recordOutlierEvent,
  recordOutlierZScore,
} from '../../platform/middleware/prometheus-metrics';
import type {
  OutlierSeverity,
  OutlierEvent,
  OutlierDetectorConfig,
  SymbolStats,
  StatsWindow,
} from './outlier-detection-types';
import {
  createSymbolStats,
  updateSymbolStats,
  computeStatsFromWindow,
} from './outlier-statistical-helpers';
import {
  detectPriceOutliers,
  detectVolumeOutliers,
  detectPriceGap as detectPriceGapAlgorithm,
} from './outlier-detection-algorithms';

// Re-exports for backward compatibility
export type {
  OutlierSeverity,
  OutlierType,
  OutlierEvent,
  SymbolStats,
  OutlierDetectorConfig,
  StatsWindow,
} from './outlier-detection-types';
export { calculateSeverity } from './outlier-statistical-helpers';
export { detectPriceOutliers, detectVolumeOutliers } from './outlier-detection-algorithms';

const DEFAULT_CONFIG: OutlierDetectorConfig = {
  zScoreThreshold: 3.0,
  iqrMultiplier: 1.5,
  minSamples: 30,
  priceGapThreshold: 0.05,
  volumeSpikeThreshold: 3.0,
  windowSize: 100,
  callbackThreshold: 'medium',
};

const SEVERITY_ORDER: Record<OutlierSeverity, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

export class OutlierDetector {
  private config: OutlierDetectorConfig;
  private stats = new Map<string, SymbolStats>();
  private priceWindows = new Map<string, StatsWindow>();
  private volumeWindows = new Map<string, StatsWindow>();
  private callbacks: Array<(event: OutlierEvent) => void> = [];

  constructor(config?: Partial<OutlierDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addPriceSample(symbol: string, price: number, provider: MarketDataSource): void {
    this.ensureStats(symbol);
    const w = this.ensureWindow(this.priceWindows, symbol);
    w.prices.push(price);
    w.timestamps.push(Date.now());
    if (w.prices.length > this.config.windowSize) { w.prices.shift(); w.timestamps.shift(); }
    updateSymbolStats(this.stats.get(symbol)!, price, 0);
    this.computeMedian(symbol, w.prices);
    const events = detectPriceOutliers(symbol, this.stats.get(symbol)!, w, this.config, provider);
    events.forEach((e) => this.processEvent(e));
  }

  addVolumeSample(symbol: string, volume: number, provider: MarketDataSource): void {
    this.ensureStats(symbol);
    const w = this.ensureWindow(this.volumeWindows, symbol);
    w.volumes.push(volume);
    w.timestamps.push(Date.now());
    if (w.volumes.length > this.config.windowSize) { w.volumes.shift(); w.timestamps.shift(); }
    updateSymbolStats(this.stats.get(symbol)!, 0, volume);
    const events = detectVolumeOutliers(symbol, this.stats.get(symbol)!, w, this.config, provider);
    events.forEach((e) => this.processEvent(e));
  }

  addCandle(candle: Candle, provider: MarketDataSource): void {
    const price = parseFloat(candle.close);
    const volume = parseFloat(candle.volume);
    if (!isNaN(price) && price > 0) this.addPriceSample(candle.symbol, price, provider);
    if (!isNaN(volume) && volume > 0) this.addVolumeSample(candle.symbol, volume, provider);
  }

  detectPriceOutlier(symbol: string, price: number, input: SymbolStats | StatsWindow): OutlierEvent | null {
    const isStats = 'sampleCount' in input;
    const stats = isStats ? input as SymbolStats : computeStatsFromWindow((input as StatsWindow).prices);
    const window: StatsWindow = isStats
      ? { prices: [price], volumes: [], timestamps: [] }
      : input as StatsWindow;
    const events = detectPriceOutliers(symbol, stats, window, this.config, MarketDataSource.SANTIMENT, price);
    events.forEach((e) => this.processEvent(e));
    return events.length > 0 ? events[0] : null;
  }

  detectVolumeOutlier(symbol: string, volume: number, input: SymbolStats | StatsWindow): OutlierEvent | null {
    const isStats = 'sampleCount' in input;
    const stats = isStats ? input as SymbolStats : computeStatsFromWindow((input as StatsWindow).volumes);
    const window: StatsWindow = isStats
      ? { prices: [], volumes: [volume], timestamps: [] }
      : input as StatsWindow;
    const events = detectVolumeOutliers(symbol, stats, window, this.config, MarketDataSource.SANTIMENT, volume);
    return events.length > 0 ? events[0] : null;
  }

  detectPriceGap(
    symbol: string,
    prevPrice: number,
    currentPrice: number,
    provider: MarketDataSource,
  ): OutlierEvent | null {
    const event = detectPriceGapAlgorithm(symbol, prevPrice, currentPrice, this.config, provider);
    if (event) this.processEvent(event);
    return event;
  }

  getStats(symbol: string): SymbolStats | null { return this.stats.get(symbol) ?? null; }
  getConfig(): OutlierDetectorConfig { return { ...this.config }; }
  reset(): void { this.stats.clear(); this.priceWindows.clear(); this.volumeWindows.clear(); }
  clearSymbol(symbol: string): void {
    this.stats.delete(symbol); this.priceWindows.delete(symbol); this.volumeWindows.delete(symbol);
  }

  onOutlier(cb: (event: OutlierEvent) => void): void { this.callbacks.push(cb); }
  removeCallback(cb: (event: OutlierEvent) => void): void {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
  }

  private ensureStats(symbol: string): void {
    if (!this.stats.has(symbol)) this.stats.set(symbol, createSymbolStats());
  }

  private ensureWindow(map: Map<string, StatsWindow>, symbol: string): StatsWindow {
    let w = map.get(symbol);
    if (!w) { w = { prices: [], volumes: [], timestamps: [] }; map.set(symbol, w); }
    return w;
  }

  private computeMedian(symbol: string, prices: number[]): void {
    const stats = this.stats.get(symbol);
    if (!stats || prices.length === 0) return;
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    stats.priceMedian = sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private processEvent(event: OutlierEvent): void {
    try {
      recordOutlierEvent(event.provider, event.symbol, event.outlierType);
      if (event.zScore !== undefined) {
        recordOutlierZScore(event.provider, event.symbol, event.outlierType, event.zScore);
      }
    } catch (error) {
      logger.error('OutlierDetector: Metrics recording failed', { error });
    }
    if (SEVERITY_ORDER[event.severity] >= SEVERITY_ORDER[this.config.callbackThreshold]) {
      for (const cb of this.callbacks) {
        try { cb(event); } catch (error) { logger.error('OutlierDetector: Callback error', { error }); }
      }
    }
  }
}

// --- Singleton ---
let outlierDetectorInstance: OutlierDetector | null = null;

export function getOutlierDetector(): OutlierDetector {
  if (!outlierDetectorInstance) outlierDetectorInstance = new OutlierDetector();
  return outlierDetectorInstance;
}

export function initializeOutlierDetector(config?: Partial<OutlierDetectorConfig>): OutlierDetector {
  outlierDetectorInstance = new OutlierDetector(config);
  return outlierDetectorInstance;
}
