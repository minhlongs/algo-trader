// SPDX-License-Identifier: MIT
/**
 * Gap Detector — prometheus metric recording helpers
 * Extracted from gap-detector.ts (S16 tranche 2 oversized-file burn-down).
 * Pure functions operating on (config, state); no class coupling.
 */

import type { GapDetectorConfig, GapTrackingState } from './gap-detector-types';
import {
  recordDataGap,
  recordGapDetectionDuration,
  setExpectedCandles,
  setReceivedCandles,
  setCandleCompleteness,
} from '../../platform/middleware/prometheus-metrics';

/**
 * Record a gap event to prometheus (data gap + detection duration).
 */
export function recordGapEvent(
  config: Required<GapDetectorConfig>,
  state: GapTrackingState,
  timestamp: number,
  _gapType: 'missing_candle' | 'stale_data'
): void {
  if (!config.enableMetrics) return;

  const duration = Date.now() - timestamp;
  recordDataGap(state.provider, state.symbol, duration);
  recordGapDetectionDuration(state.provider, state.symbol, duration);
}

/**
 * Record a stale-data metric to prometheus (placeholder — no metric emitted yet).
 */
export function recordStaleDataMetric(
  config: Required<GapDetectorConfig>,
  _symbol: string,
  _timeframe: string,
  _staleMinutes: number
): void {
  if (!config.enableMetrics) return;
  // Implementation: could record a metric if needed
}

/**
 * Push expected/received/completeness gauges for a tracking state.
 */
export function updateMetrics(
  config: Required<GapDetectorConfig>,
  state: GapTrackingState
): void {
  if (!config.enableMetrics) return;

  setExpectedCandles(state.provider, state.symbol, state.timeframe, state.expectedCandles);
  setReceivedCandles(state.provider, state.symbol, state.timeframe, state.receivedCandles);

  const completeness = state.expectedCandles > 0
    ? (state.receivedCandles / state.expectedCandles) * 100
    : 100;
  setCandleCompleteness(state.provider, state.symbol, state.timeframe, completeness);
}
