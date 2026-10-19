// SPDX-License-Identifier: MIT
/**
 * Outlier Detection System — thin orchestrator.
 * Delegates detection math and stats to focused sub-modules.
 * Barrel re-exports preserve backward compatibility.
 */

import { MarketDataSource } from './types';
import type { Candle } from './types';
import type {
  OutlierSeverity,
  OutlierEvent,
  OutlierDetectorConfig,
  SymbolStats,
  StatsWindow,
} from './outlier-detection-types';
import { updateSymbolStats } from './outlier-statistical-helpers';
import {
  detectPriceOutliers,
  detectVolumeOutliers,
  detectPriceGap as detectPriceGapAlgorithm,
} from './outlier-detection-algorithms';
import {
  DEFAULT_CONFIG,
  SEVERITY_ORDER,
  appendWindowSample,
  computeMedianValue,
  dispatchOutlierEvent,
  ensureSymbolStatsEntry,
  resolveOutlierStatsAndWindow,
} from './outlier-detection-config';

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
export {
  DEFAULT_CONFIG,
  SEVERITY_ORDER,
  appendWindowSample,
  computeMedianValue,
  dispatchOutlierEvent,
  ensureSymbolStatsEntry,
  resolveOutlierStatsAndWindow,
} from './outlier-detection-config';

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
    const symbolStats = ensureSymbolStatsEntry(this.stats, symbol);
    const w = appendWindowSample(this.priceWindows, symbol, price, this.config.windowSize, 'price');
    updateSymbolStats(symbolStats, price, 0);
    if (w.prices.length > 0) symbolStats.priceMedian = computeMedianValue(w.prices);
    const events = detectPriceOutliers(symbol, symbolStats, w, this.config, provider);
    events.forEach((e) => this.processEvent(e));
  }

  addVolumeSample(symbol: string, volume: number, provider: MarketDataSource): void {
    const symbolStats = ensureSymbolStatsEntry(this.stats, symbol);
    const w = appendWindowSample(this.volumeWindows, symbol, volume, this.config.windowSize, 'volume');
    updateSymbolStats(symbolStats, 0, volume);
    const events = detectVolumeOutliers(symbol, symbolStats, w, this.config, provider);
    events.forEach((e) => this.processEvent(e));
  }

  addCandle(candle: Candle, provider: MarketDataSource): void {
    const price = parseFloat(candle.close);
    const volume = parseFloat(candle.volume);
    if (!isNaN(price) && price > 0) this.addPriceSample(candle.symbol, price, provider);
    if (!isNaN(volume) && volume > 0) this.addVolumeSample(candle.symbol, volume, provider);
  }

  detectPriceOutlier(symbol: string, price: number, input: SymbolStats | StatsWindow): OutlierEvent | null {
    const { stats, window } = resolveOutlierStatsAndWindow(input, price, 'price');
    const events = detectPriceOutliers(symbol, stats, window, this.config, MarketDataSource.SANTIMENT, price);
    events.forEach((e) => this.processEvent(e));
    return events.length > 0 ? events[0] : null;
  }

  detectVolumeOutlier(symbol: string, volume: number, input: SymbolStats | StatsWindow): OutlierEvent | null {
    const { stats, window } = resolveOutlierStatsAndWindow(input, volume, 'volume');
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

  private processEvent(event: OutlierEvent): void {
    dispatchOutlierEvent(event, this.config.callbackThreshold, this.callbacks);
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
