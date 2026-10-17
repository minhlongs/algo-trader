// SPDX-License-Identifier: MIT
/**
 * Gap Detector — pure window, key, and statistics helpers.
 */

import type { GapStats, GapTrackingState } from './gap-detector-types';

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
  timeframe: string,
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
