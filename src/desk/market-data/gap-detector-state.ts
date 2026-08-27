// SPDX-License-Identifier: MIT
/**
 * Gap Detector — tracking-state helpers + pure gap logic
 * Extracted from gap-detector.ts (S16 tranche 2 oversized-file burn-down).
 * Pure functions operating on explicit (config, state); no class coupling.
 */

import type { GapDetectorConfig, GapStats, GapTrackingState } from './gap-detector-types';
import { recordGapEvent, updateMetrics } from './gap-detector-metrics';

/**
 * Build the map key for a provider/symbol/timeframe combination.
 */
export function getKey(provider: string, symbol: string, timeframe: string): string {
  return `${provider}:${symbol}:${timeframe}`;
}

/**
 * Return the tracking state for a key, creating and storing it if absent.
 */
export function getOrCreateState(
  trackingStates: Map<string, GapTrackingState>,
  key: string,
  provider: string,
  symbol: string,
  timeframe: string
): GapTrackingState {
  let state = trackingStates.get(key);
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
    trackingStates.set(key, state);
  }
  return state;
}

/**
 * Reset the SLA window counters for a tracking state.
 */
export function resetWindow(state: GapTrackingState): void {
  state.expectedCandles = 0;
  state.receivedCandles = 0;
  state.windowStartTime = Date.now();
}

/**
 * Build a GapStats snapshot from a tracking state (pure — no Date.now()).
 */
export function buildGapStats(state: GapTrackingState): GapStats {
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
 * Result of applying a received candle to a tracking state.
 */
export type RecordCandleOutcome =
  | { kind: 'first' }
  | { kind: 'unknown-timeframe' }
  | { kind: 'gap'; missingCount: number; lastCandle: number; currentCandle: number }
  | { kind: 'ok' };

/**
 * Apply a received candle to a tracking state, mutating counters/metrics.
 * Returns a descriptor so the caller can emit logging without coupling to logic.
 */
export function applyRecordedCandle(
  config: Required<GapDetectorConfig>,
  state: GapTrackingState,
  candleTime: number,
  now: number
): RecordCandleOutcome {
  // First candle for this tracking session
  if (state.lastCandleTimestamp === null) {
    state.lastCandleTimestamp = candleTime;
    state.receivedCandles++;
    state.expectedCandles++;
    updateMetrics(config, state);
    return { kind: 'first' };
  }

  // Calculate expected candles since last received
  const interval = config.timeframeIntervals[state.timeframe];
  if (!interval) {
    return { kind: 'unknown-timeframe' };
  }

  const candlesExpected = Math.floor((candleTime - state.lastCandleTimestamp) / interval);
  const candlesActuallyReceived = 1; // We received this one

  const lastCandle = state.lastCandleTimestamp;
  state.consecutiveMissing = 0; // Reset on each received candle

  let outcome: RecordCandleOutcome = { kind: 'ok' };
  // If there's a gap
  if (candlesExpected > 1) {
    const missingCount = candlesExpected - candlesActuallyReceived;
    state.gapsDetected += missingCount;

    for (let i = 0; i < missingCount; i++) {
      const gapTimestamp = lastCandle + interval * (i + 1);
      recordGapEvent(config, state, gapTimestamp, 'missing_candle');
    }

    outcome = { kind: 'gap', missingCount, lastCandle, currentCandle: candleTime };
  } else {
    state.consecutiveMissing = 0;
  }

  // Update state
  state.lastCandleTimestamp = candleTime;
  state.receivedCandles++;
  state.expectedCandles += candlesExpected;

  // Reset window if SLA window elapsed
  if (now - state.windowStartTime > config.slaWindowMs) {
    resetWindow(state);
  }

  updateMetrics(config, state);
  return outcome;
}

/**
 * Result of a periodic gap check for a tracking state.
 */
export type CheckGapsOutcome =
  | { kind: 'none' }
  | { kind: 'gap'; consecutiveMissing: number };

/**
 * Check for elapsed gaps against a tracking state, mutating counters/metrics.
 * Returns a descriptor so the caller can emit logging without coupling to logic.
 */
export function detectGaps(
  config: Required<GapDetectorConfig>,
  state: GapTrackingState,
  now: number
): CheckGapsOutcome {
  const interval = config.timeframeIntervals[state.timeframe];
  if (!interval || state.lastCandleTimestamp === null) {
    return { kind: 'none' };
  }

  // Calculate how many candles should have arrived by now
  const expectedCandlesSinceLast = Math.floor((now - state.lastCandleTimestamp) / interval);

  if (expectedCandlesSinceLast > 0) {
    const actualGap = expectedCandlesSinceLast;
    state.consecutiveMissing += actualGap;
    state.gapsDetected += actualGap;

    recordGapEvent(config, state, now, 'missing_candle');

    return { kind: 'gap', consecutiveMissing: state.consecutiveMissing };
  }

  return { kind: 'none' };
}
