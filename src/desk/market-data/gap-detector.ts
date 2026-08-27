// SPDX-License-Identifier: MIT
/**
 * Gap Detection System (facade)
 *
 * Re-exports types and helpers split into gap-detector-types.ts,
 * gap-detector-metrics.ts, and gap-detector-state.ts (S16 tranche 2).
 */

import { logger } from '../../shared/utils/logger';
import type { Candle } from './types';
import type { GapDetectorConfig, GapTrackingState, GapStats } from './gap-detector-types';
import {
  recordStaleDataMetric,
  updateMetrics,
} from './gap-detector-metrics';
import {
  getKey,
  getOrCreateState,
  resetWindow,
  buildGapStats,
  applyRecordedCandle,
  detectGaps,
} from './gap-detector-state';

export type { GapDetectorConfig, GapStats } from './gap-detector-types';

export class GapDetector {
  private config: Required<GapDetectorConfig>;
  private trackingStates: Map<string, GapTrackingState>;

  constructor(config: Partial<GapDetectorConfig> = {}) {
    this.config = {
      maxAcceptableGap: config.maxAcceptableGap ?? 2,
      timeframeIntervals: {
        '1m': 60_000,
        '5m': 300_000,
        '15m': 900_000,
        '30m': 1_800_000,
        '1h': 3_600_000,
        '4h': 14_400_000,
        '1d': 86_400_000,
        ...config.timeframeIntervals,
      },
      slaWindowMs: config.slaWindowMs ?? 24 * 60 * 60 * 1000,
      enableMetrics: config.enableMetrics ?? true,
    };
    this.trackingStates = new Map();
  }

  startTracking(provider: string, symbol: string, timeframe: string): void {
    const key = getKey(provider, symbol, timeframe);
    if (this.trackingStates.has(key)) return;

    const state: GapTrackingState = {
      provider,
      symbol,
      timeframe,
      lastCandleTimestamp: null,
      consecutiveMissing: 0,
      expectedCandles: 0,
      receivedCandles: 0,
      windowStartTime: Date.now(),
      gapsDetected: 0,
    };
    this.trackingStates.set(key, state);
    logger.debug('GapDetector: Started tracking', { provider, symbol, timeframe });
  }

  stopTracking(provider: string, symbol: string, timeframe: string): void {
    const key = getKey(provider, symbol, timeframe);
    this.trackingStates.delete(key);
  }

  recordCandle(provider: string, symbol: string, timeframe: string, candle: Candle): void {
    const key = getKey(provider, symbol, timeframe);
    const state = getOrCreateState(this.trackingStates, key, provider, symbol, timeframe);

    const outcome = applyRecordedCandle(this.config, state, candle.timestamp, Date.now());

    if (outcome.kind === 'unknown-timeframe') {
      logger.warn('GapDetector: Unknown timeframe, skipping gap check', { provider, symbol, timeframe });
    } else if (outcome.kind === 'gap') {
      logger.warn('GapDetector: Data gap detected', {
        provider,
        symbol,
        timeframe,
        missingCount: outcome.missingCount,
        lastCandle: outcome.lastCandle,
        currentCandle: outcome.currentCandle,
      });
    }
  }

  checkGaps(provider: string, symbol: string, timeframe: string): boolean {
    const key = getKey(provider, symbol, timeframe);
    const state = this.trackingStates.get(key);
    if (!state) return false;

    const outcome = detectGaps(this.config, state, Date.now());

    if (outcome.kind === 'gap') {
      logger.error('GapDetector: Gap threshold exceeded', {
        provider,
        symbol,
        timeframe,
        consecutiveMissing: outcome.consecutiveMissing,
        maxAcceptable: this.config.maxAcceptableGap,
      });
      return true;
    }

    return false;
  }

  recordStaleData(provider: string, symbol: string, timeframe: string, candleTimestamp: number, receivedAt: number): void {
    const key = getKey(provider, symbol, timeframe);
    getOrCreateState(this.trackingStates, key, provider, symbol, timeframe);

    const interval = this.config.timeframeIntervals[timeframe];
    if (!interval) return;

    const staleMinutes = Math.floor((receivedAt - candleTimestamp) / 60_000);

    if (staleMinutes > 5) {
      recordStaleDataMetric(this.config, symbol, timeframe, staleMinutes);
      logger.warn('GapDetector: Stale data detected', {
        provider,
        symbol,
        timeframe,
        staleMinutes,
        candleTimestamp,
        receivedAt,
      });
    }
  }

  getStats(provider: string, symbol: string, timeframe: string): GapStats | null {
    const state = this.trackingStates.get(getKey(provider, symbol, timeframe));
    return state ? buildGapStats(state) : null;
  }

  getAllStats(): GapStats[] {
    const stats: GapStats[] = [];
    for (const state of this.trackingStates.values()) {
      const stat = buildGapStats(state);
      if (stat) stats.push(stat);
    }
    return stats;
  }

  reset(provider: string, symbol: string, timeframe: string): void {
    const state = this.trackingStates.get(getKey(provider, symbol, timeframe));
    if (state) {
      resetWindow(state);
      updateMetrics(this.config, state);
    }
  }
}

let gapDetectorInstance: GapDetector | null = null;

export function getGapDetector(): GapDetector {
  if (!gapDetectorInstance) {
    gapDetectorInstance = new GapDetector();
  }
  return gapDetectorInstance;
}

export function initializeGapDetector(config?: Partial<GapDetectorConfig>): GapDetector {
  gapDetectorInstance = new GapDetector(config);
  return gapDetectorInstance;
}