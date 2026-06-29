// SPDX-License-Identifier: MIT
/**
 * Gap Detection System
 * Detects missing candles and data gaps in market data feeds
 */

import { logger } from '../shared/utils/logger.js';
import type { MarketDataSource, Candle, Timeframe } from './types.js';
import {
  recordDataGap,
  recordGapDetectionDuration,
  setExpectedCandles,
  setReceivedCandles,
  setCandleCompleteness,
} from '../middleware/prometheus-metrics.js';

/**
 * Configuration for gap detection
 */
export interface GapDetectorConfig {
  /** Max acceptable consecutive missing candles before alerting (per symbol/timeframe) */
  maxAcceptableGap: number;
  /** Expected candle intervals in milliseconds per timeframe */
  timeframeIntervals: Record<string, number>;
  /** Window size for SLA tracking (ms) */
  slaWindowMs: number;
  /** Whether to record metrics */
  enableMetrics: boolean;
}

/**
 * Gap detection state per symbol/timeframe
 */
interface GapTrackingState {
  provider: string;
  symbol: string;
  timeframe: string;
  lastCandleTimestamp: number | null;
  consecutiveMissing: number;
  expectedCandles: number;
  receivedCandles: number;
  windowStartTime: number;
  gapsDetected: number;
}

/**
 * Gap Detector
 *
 * Tracks expected candle arrival times and detects gaps when candles are missing.
 * Integrates with metrics for SLA calculation and alerting.
 *
 * @example
 * ```typescript
 * const detector = new GapDetector();
 * detector.startTracking('santiment', 'BTC/USDT', '1h');
 *
 * // When a candle arrives:
 * detector.recordCandle('santiment', 'BTC/USDT', '1h', candle);
 *
 * // Check for gaps:
 * detector.checkGaps('santiment', 'BTC/USDT', '1h');
 * ```
 */
export class GapDetector {
  private config: Required<GapDetectorConfig>;
  private trackingStates: Map<string, GapTrackingState>;
  private readonly STATE_PREFIX = 'gap:state:';

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
      slaWindowMs: config.slaWindowMs ?? 24 * 60 * 60 * 1000, // 24 hours
      enableMetrics: config.enableMetrics ?? true,
    };
    this.trackingStates = new Map();
  }

  /**
   * Start tracking a symbol/timeframe combination
   */
  startTracking(provider: string, symbol: string, timeframe: string): void {
    const key = this.getKey(provider, symbol, timeframe);
    if (this.trackingStates.has(key)) {
      return; // Already tracking
    }

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

  /**
   * Stop tracking a symbol/timeframe
   */
  stopTracking(provider: string, symbol: string, timeframe: string): void {
    const key = this.getKey(provider, symbol, timeframe);
    this.trackingStates.delete(key);
  }

  /**
   * Record a received candle and update tracking state
   */
  recordCandle(provider: string, symbol: string, timeframe: string, candle: Candle): void {
    const key = this.getKey(provider, symbol, timeframe);
    const state = this.getOrCreateState(key, provider, symbol, timeframe);

    const candleTime = candle.timestamp;
    const now = Date.now();

    // First candle for this tracking session
    if (state.lastCandleTimestamp === null) {
      state.lastCandleTimestamp = candleTime;
      state.receivedCandles++;
    state.expectedCandles++;
      this.updateMetrics(state);
      return;
    }

    // Calculate expected candles since last received
    const interval = this.config.timeframeIntervals[timeframe];
    if (!interval) {
      logger.warn('GapDetector: Unknown timeframe, skipping gap check', { provider, symbol, timeframe });
      return;
    }

    const candlesExpected = Math.floor((candleTime - state.lastCandleTimestamp) / interval);
    const candlesActuallyReceived = 1; // We received this one

  state.consecutiveMissing = 0; // Reset on each received candle
    // If there's a gap
    if (candlesExpected > 1) {
      const missingCount = candlesExpected - candlesActuallyReceived;
      state.gapsDetected += missingCount;

      for (let i = 0; i < missingCount; i++) {
        const gapTimestamp = state.lastCandleTimestamp + interval * (i + 1);
        this.recordGapEvent(state, gapTimestamp, 'missing_candle');
      }

      logger.warn('GapDetector: Data gap detected', {
        provider,
        symbol,
        timeframe,
        missingCount,
        lastCandle: state.lastCandleTimestamp,
        currentCandle: candleTime,
      });
    } else {
      state.consecutiveMissing = 0;
    }

    // Update state
    state.lastCandleTimestamp = candleTime;
    state.receivedCandles++;
    state.expectedCandles += candlesExpected;

    // Reset window if SLA window elapsed
    if (now - state.windowStartTime > this.config.slaWindowMs) {
      this.resetWindow(state);
    }

    this.updateMetrics(state);
  }

  /**
   * Check for gaps based on expected timing (call periodically)
   * Returns true if gaps detected that exceed acceptable threshold
   */
  checkGaps(provider: string, symbol: string, timeframe: string): boolean {
    const key = this.getKey(provider, symbol, timeframe);
    const state = this.trackingStates.get(key);
    if (!state) {
      return false;
    }

    const now = Date.now();
    const interval = this.config.timeframeIntervals[timeframe];
    if (!interval || state.lastCandleTimestamp === null) {
      return false;
    }

    // Calculate how many candles should have arrived by now
    const expectedCandlesSinceLast = Math.floor((now - state.lastCandleTimestamp) / interval);

    if (expectedCandlesSinceLast > 0) {
      const actualGap = expectedCandlesSinceLast;
      state.consecutiveMissing += actualGap;
      state.gapsDetected += actualGap;

      this.recordGapEvent(state, now, 'missing_candle');

      logger.error('GapDetector: Gap threshold exceeded', {
        provider,
        symbol,
        timeframe,
        consecutiveMissing: state.consecutiveMissing,
        maxAcceptable: this.config.maxAcceptableGap,
      });

      return true;
    }

    return false;
  }

  /**
   * Record a stale data event (candle received later than expected)
   */
  recordStaleData(provider: string, symbol: string, timeframe: string, candleTimestamp: number, receivedAt: number): void {
    const key = this.getKey(provider, symbol, timeframe);
    const state = this.getOrCreateState(key, provider, symbol, timeframe);

    const interval = this.config.timeframeIntervals[timeframe];
    if (!interval) return;

    const staleMinutes = Math.floor((receivedAt - candleTimestamp) / 60_000);

    if (staleMinutes > 5) { // Stale if > 5 minutes late
      this.recordStaleDataMetric(symbol, timeframe, staleMinutes);
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

  /**
   * Get gap statistics for a symbol/timeframe
   */
  getStats(provider: string, symbol: string, timeframe: string): GapStats | null {
    const key = this.getKey(provider, symbol, timeframe);
    const state = this.trackingStates.get(key);
    if (!state) return null;

    const now = Date.now();
    const windowHours = (now - state.windowStartTime) / (60 * 60 * 1000);
    const totalExpected = state.expectedCandles;
    const totalReceived = state.receivedCandles;
    const completeness = totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 100;

    return {
      symbol: state.symbol,
      timeframe: state.timeframe,
      provider: state.provider,
      consecutiveMissing: state.consecutiveMissing,
      totalGaps: state.gapsDetected,
      completenessPercent: completeness,
      expectedCandles: totalExpected,
      receivedCandles: totalReceived,
      lastCandleTime: state.lastCandleTimestamp,
    };
  }

  /**
   * Get all tracking states
   */
  getAllStats(): GapStats[] {
    const stats: GapStats[] = [];
    for (const [key, state] of this.trackingStates) {
      const stat = this.getStats(state.provider, state.symbol, state.timeframe);
      if (stat) stats.push(stat);
    }
    return stats;
  }

  /**
   * Reset tracking state for a symbol/timeframe
   */
  reset(provider: string, symbol: string, timeframe: string): void {
    const key = this.getKey(provider, symbol, timeframe);
    const state = this.trackingStates.get(key);
    if (state) {
      this.resetWindow(state);
      this.updateMetrics(state);
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getKey(provider: string, symbol: string, timeframe: string): string {
    return `${provider}:${symbol}:${timeframe}`;
  }

  private getOrCreateState(key: string, provider: string, symbol: string, timeframe: string): GapTrackingState {
    let state = this.trackingStates.get(key);
    if (!state) {
      state = {
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
    }
    return state;
  }

  private resetWindow(state: GapTrackingState): void {
    state.expectedCandles = 0;
    state.receivedCandles = 0;
    state.windowStartTime = Date.now();
  }

  private recordGapEvent(state: GapTrackingState, timestamp: number, gapType: 'missing_candle' | 'stale_data'): void {
    if (!this.config.enableMetrics) return;

    const duration = Date.now() - timestamp;
    recordDataGap(state.provider, state.symbol, duration);
    recordGapDetectionDuration(state.provider, state.symbol, duration);
  }

  private recordStaleDataMetric(symbol: string, timeframe: string, staleMinutes: number): void {
    if (!this.config.enableMetrics) return;
    // Implementation: could record a metric if needed
  }

  private updateMetrics(state: GapTrackingState): void {
    if (!this.config.enableMetrics) return;

    setExpectedCandles(state.provider, state.symbol, state.timeframe, state.expectedCandles);
    setReceivedCandles(state.provider, state.symbol, state.timeframe, state.receivedCandles);

    const completeness = state.expectedCandles > 0
      ? (state.receivedCandles / state.expectedCandles) * 100
      : 100;
    setCandleCompleteness(state.provider, state.symbol, state.timeframe, completeness);
  }
}

/**
 * Gap statistics
 */
export interface GapStats {
  symbol: string;
  timeframe: string;
  provider: string;
  consecutiveMissing: number;
  totalGaps: number;
  completenessPercent: number;
  expectedCandles: number;
  receivedCandles: number;
  lastCandleTime: number | null;
}

/**
 * Singleton instance for global use
 */
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
