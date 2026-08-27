// SPDX-License-Identifier: MIT
/**
 * Gap Detector — shared type definitions
 * Extracted from gap-detector.ts (S16 tranche 2 oversized-file burn-down).
 */

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
export interface GapTrackingState {
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
